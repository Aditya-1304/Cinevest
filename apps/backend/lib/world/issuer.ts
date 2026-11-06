import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { type Address, type Hex, verifyTypedData, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET, worldAuthorizationData, worldAuthorizationDigest, type WorldAuthorizationGrant } from "@cinevest/abi";
import { createDatabase } from "@/lib/db";
import { proofChallenges, worldAuthorizations, worldVerifications } from "@/lib/db/schema";
import { requireServerEnv } from "@/lib/env";
import { readWorldContext } from "./challenge";
import { readWorldFundingState } from "./arc";
import { WorldError } from "./error";
import { worldHash } from "./store";

/** One permission per consumed challenge: persist before exposing a signature, and never renew a used/expired row. */
export async function issueWorldAuthorization(wallet: string, token: string,
  dependencies = { db: createDatabase(), readState: readWorldFundingState }): Promise<WorldAuthorizationGrant> {
  let context;
  try { context = await readWorldContext(wallet, token); }
  catch { throw new WorldError("Challenge expired or changed; verify again", 410); }
  const environment = z.enum(["production", "staging"]).parse(process.env.WORLD_AUTHORIZATION_ENVIRONMENT ?? "production");
  if (context.environment !== environment || context.environment !== (process.env.WORLD_ENVIRONMENT ?? "staging")
      || context.rpId !== requireServerEnv("WORLD_RP_ID")) {
    throw new WorldError("This World proof environment is not enabled for funding", 403);
  }
  const { db } = dependencies;
  const nonceHash = worldHash(context.nonce);
  const [verified] = await db.select({ challenge: proofChallenges, identity: worldVerifications })
    .from(proofChallenges).innerJoin(worldVerifications, eq(proofChallenges.verificationId, worldVerifications.id))
    .where(and(eq(proofChallenges.nonceHash, nonceHash), eq(proofChallenges.contextHash, worldHash(token)),
      eq(proofChallenges.wallet, wallet), isNotNull(proofChallenges.consumedAt))).limit(1);
  if (!verified || verified.identity.wallet !== wallet || verified.identity.environment !== environment
      || verified.identity.arcChainId !== context.arcChainId || verified.identity.campaignAddress !== context.campaignAddress) {
    throw new WorldError("Complete World ID verification before requesting funding permission", 403);
  }
  const credentialExpiry = verified.challenge.credentialExpiresAt;
  const now = Math.floor(Date.now() / 1000);
  const bound = Math.min(Math.floor(verified.challenge.expiresAt.getTime() / 1000),
    credentialExpiry ? Math.floor(credentialExpiry.getTime() / 1000) : 0);
  if (bound <= now) throw new WorldError("Proof expired; verify again", 410);
  const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(requireServerEnv("WORLD_VERIFIER_PRIVATE_KEY")) as Hex;
  const account = privateKeyToAccount(privateKey);
  const rpKey = requireServerEnv("WORLD_RP_SIGNING_KEY").replace(/^0x/, "");
  if (privateKey.slice(2).toLowerCase() === rpKey.toLowerCase()) throw new WorldError("A separate funding verifier key is required", 503);
  const [existing] = await db.select().from(worldAuthorizations).where(eq(worldAuthorizations.challengeNonceHash, nonceHash)).limit(1);
  const campaign = context.campaignAddress as Address;
  const nullifier = verified.identity.scopedNullifierHash as Hex;
  const state = await dependencies.readState(campaign, nullifier, existing?.digest as Hex | undefined);
  if (!state.terms.worldGated || !state.open) throw new WorldError("Campaign funding is closed or does not require World ID", 409);
  if (state.signer.toLowerCase() !== account.address.toLowerCase()) throw new WorldError("Campaign verifier configuration does not match this server", 503);
  if (state.owner !== zeroAddress && state.owner.toLowerCase() !== wallet) throw new WorldError("This human is already bound to another wallet", 403);
  if (state.funded >= state.terms.perHumanLimit) throw new WorldError("This human has reached the campaign funding limit", 403);
  if (state.used) throw new WorldError("Permission already used; verify again for another contribution", 409);
  let row = existing;
  if (!row) {
    const deadline = Math.min(now + 300, bound);
    const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
    const message = { wallet: wallet as Address, campaign, scopedNullifierHash: nullifier, nonce, deadline: BigInt(deadline) };
    const digest = worldAuthorizationDigest(ARC_TESTNET.id, message);
    const signature = await account.signTypedData(worldAuthorizationData(ARC_TESTNET.id, message));
    // Concurrent issuers may prepare candidates, but only the persisted winner may leave the server.
    await db.insert(worldAuthorizations).values({ challengeNonceHash: nonceHash, nonce, digest,
      signer: account.address.toLowerCase(), signature, deadline: new Date(deadline * 1000) }).onConflictDoNothing();
    [row] = await db.select().from(worldAuthorizations).where(eq(worldAuthorizations.challengeNonceHash, nonceHash)).limit(1);
  }
  if (!row) throw new WorldError("Permission could not be saved; retry", 503);
  const deadline = Math.floor(row.deadline.getTime() / 1000);
  if (deadline <= Math.floor(Date.now() / 1000) || deadline > bound) throw new WorldError("Permission expired; verify again", 410);
  const authorization = { wallet: wallet as Address, campaign, scopedNullifierHash: nullifier,
    nonce: row.nonce as Hex, deadline: BigInt(deadline) };
  if (row.signer !== account.address.toLowerCase() || row.digest !== worldAuthorizationDigest(ARC_TESTNET.id, authorization)
      || !await verifyTypedData({ ...worldAuthorizationData(ARC_TESTNET.id, authorization), address: account.address, signature: row.signature as Hex })) {
    throw new WorldError("Stored permission does not match the campaign verifier", 503);
  }
  return { chainId: ARC_TESTNET.id, authorization: { ...authorization, deadline: String(deadline) },
    digest: row.digest as Hex, signature: row.signature as Hex };
}
