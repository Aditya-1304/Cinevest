import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { eq as arkivEq } from "@arkiv-network/sdk/query";
import { key } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { ARC_TESTNET, ARC_TESTNET_USDC } from "@cinevest/abi";
import { createDatabase } from "@/lib/db";
import { listingExtensions } from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";
import { readJson } from "@/lib/http";
import { verifyWalletRequest } from "@/lib/wallet-auth";
import { filmSchema } from "@/lib/arkiv/film-schema";
import { extensionPolicy } from "@/lib/arkiv/extension-policy";
import { queryFilmDetail } from "@/lib/arkiv/film-detail";
import { validateFilmCandidate, verifyFilmCandidateTerms } from "@/lib/arkiv/candidate-validation";
import { deserializeCampaignTerms } from "@/lib/workflows/terms-input";

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const schema = z.object({ action: z.literal("extend-listing"), actor: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  entityId: hash, campaignAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  targetBlock: z.string().regex(/^[1-9][0-9]{0,19}$/), txHash: hash.optional(), issuedAt: z.number().int(), signature: z.string().optional(),
}).strict();

/**
 * Preflights and reconciles a creator's wallet-signed extendEntity operation. The API never
 * extends a listing itself, and a lost receipt is checked against persisted IDs and live expiry.
 */
export async function POST(request: NextRequest) {
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await readJson(request)); }
  catch { return NextResponse.json({ error: "Invalid renewal request" }, { status: 400 }); }
  if (!(await verifyWalletRequest(input, request))) return NextResponse.json({ error: "Creator sign-in required" }, { status: 401 });
  try {
    const actor = input.actor.toLowerCase();
    const entityId = input.entityId.toLowerCase();
    const campaignAddress = input.campaignAddress.toLowerCase() as `0x${string}`;
    const client = createPublicClient({ chain: rabdi({ accessKey: getServerEnv().ARKIV_ACCESS_KEY ?? "" }), transport: http(getServerEnv().ARKIV_RPC_URL, { timeout: 5000, retryCount: 0 }) });
    const page = await client.select({ $key: true, $owner: true, $expiresAt: true, arcChainId: true, campaignAddress: true,
      creatorAddress: true, genre: true, fundingDeadline: true, title: true, pitchSwarmRef: true, posterSwarmRef: true,
      termsDigest: true, createdAt: true, schemaVersion: true }).from(filmSchema, { onMismatch: "throw" })
      .where(arkivEq("$key", key(entityId as `0x${string}`))).limit(1).fetch();
    const row = page.entities[0];
    if (!row) return NextResponse.json({ error: "Listing is expired or absent; campaign remains accessible on Arc" }, { status: 410 });
    const candidate = validateFilmCandidate(row, ARC_TESTNET.id);
    if (!candidate.valid || candidate.campaign !== campaignAddress) return NextResponse.json({ error: "Invalid listing identity" }, { status: 422 });
    const film = await queryFilmDetail(ARC_TESTNET.id, campaignAddress);
    const terms = deserializeCampaignTerms(film.terms);
    if (verifyFilmCandidateTerms(candidate.entity, terms, ARC_TESTNET.id, ARC_TESTNET_USDC.address)) return NextResponse.json({ error: "Listing terms do not match Arc" }, { status: 422 });
    const currentBlock = await client.getBlockNumber();
    const policy = extensionPolicy({ actor, owner: row.$owner, creator: String(film.terms.creator), currentBlock, expiresAt: row.$expiresAt!, targetBlock: BigInt(input.targetBlock) });
    if (policy === "forbidden") return NextResponse.json({ error: "Only the original creator and current owner may renew; ownership transfers are unsupported" }, { status: 403 });
    if (policy === "invalid-target" || policy === "expired") return NextResponse.json({ error: policy }, { status: 422 });
    const db = createDatabase();
    const identity = and(eq(listingExtensions.actor, actor), eq(listingExtensions.entityId, entityId), eq(listingExtensions.targetBlock, input.targetBlock));
    await db.insert(listingExtensions).values({ actor, entityId, campaignAddress, targetBlock: input.targetBlock }).onConflictDoNothing();
    let [operation] = await db.select().from(listingExtensions).where(identity).limit(1);
    if (!operation || operation.campaignAddress !== campaignAddress) throw new Error("Renewal identity conflict");
    if (input.txHash) {
      const txHash = input.txHash.toLowerCase();
      if (operation.txHash && operation.txHash !== txHash) return NextResponse.json({ error: "A different renewal transaction is already recorded" }, { status: 409 });
      // Persist the wallet-returned hash before receipt polling or deciding to permit a retry.
      const [updated] = await db.update(listingExtensions).set({ txHash, status: "submitted", revision: sql`${listingExtensions.revision} + 1`, updatedAt: new Date() })
        .where(and(identity, eq(listingExtensions.revision, operation.revision))).returning();
      if (!updated) return NextResponse.json({ error: "Renewal changed concurrently" }, { status: 409 });
      operation = updated;
    }
    let status = policy === "confirmed" ? "confirmed" : operation.status;
    if (policy !== "confirmed" && operation.txHash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash: operation.txHash as `0x${string}` });
        const tx = await client.getTransaction({ hash: operation.txHash as `0x${string}` });
        if (tx.from.toLowerCase() !== actor || receipt.status !== "success") status = "failed";
      } catch { status = "submitted"; }
    }
    if (status !== operation.status) await db.update(listingExtensions).set({ status, revision: sql`${listingExtensions.revision} + 1`, updatedAt: new Date() })
      .where(and(identity, eq(listingExtensions.revision, operation.revision)));
    return NextResponse.json({ id: operation.id, entityId, status, authorized: status === "pending", retryable: status === "submitted",
      targetBlock: input.targetBlock, expiresAtBlock: row.$expiresAt!.toString(), remainingBlocks: (row.$expiresAt! - currentBlock).toString() }, { status: status === "submitted" ? 202 : 200, headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Renewal is temporarily unavailable", retryable: true }, { status: 503 }); }
}
