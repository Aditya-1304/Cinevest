import "server-only";

import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, asc, eq } from "@arkiv-network/sdk/query";
import { addr, key, str } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { ARC_TESTNET, ARC_TESTNET_USDC } from "@cinevest/abi";
import { getServerEnv } from "../env";
import { filmSchema } from "./film-schema";
import { queryFilmDetail } from "./film-detail";
import { validateFilmCandidate, verifyFilmCandidateTerms } from "./candidate-validation";
import { deserializeCampaignTerms } from "../workflows/terms-input";

/** Confirms a creator-signed Arkiv entity exists and is owned by the publishing wallet. */
export async function findOwnedFilmEntity({
  actor,
  campaignAddress,
  requestDigest,
  entityId,
}: {
  actor: string;
  campaignAddress: `0x${string}`;
  requestDigest: string;
  /** When absent, reconciles an uncertain write by looking the listing up by campaign and owner. */
  entityId?: string;
}) {
  if (entityId !== undefined && !/^0x[0-9a-fA-F]{64}$/.test(entityId)) return null;
  const chain = rabdi({ accessKey: getServerEnv().ARKIV_ACCESS_KEY ?? "" });
  const client = createPublicClient({
    chain,
    transport: http(getServerEnv().ARKIV_RPC_URL, { timeout: 5_000, retryCount: 0 }),
  });
  const filters = [];
  filters.push(eq("campaignAddress", addr(campaignAddress)));
  filters.push(eq("operationDigest", str(requestDigest)));
  if (entityId) filters.push(eq("$key", key(entityId as `0x${string}`)));
  const page = await client
    .select({
      $key: true,
      $owner: true,
      $expiresAt: true,
      arcChainId: true,
      campaignAddress: true,
      creatorAddress: true,
      termsDigest: true,
      operationDigest: true,
      genre: true, fundingDeadline: true, title: true, pitchSwarmRef: true,
      posterSwarmRef: true, createdAt: true, schemaVersion: true,
    })
    .from(filmSchema, { onMismatch: "throw" })
    .ownedBy(actor as `0x${string}`)
    .where(and(...filters))
    .orderBy(asc("$key"))
    .limit(entityId ? 1 : 100)
    .fetch();
  const film = await queryFilmDetail(ARC_TESTNET.id, campaignAddress);
  const terms = deserializeCampaignTerms(film.terms);
  const block = await client.getBlockNumber();
  const entity = page.entities.find((row) => {
    const candidate = validateFilmCandidate(row, ARC_TESTNET.id);
    return row.operationDigest?.value === requestDigest && candidate.valid &&
      typeof row.$expiresAt === "bigint" && row.$expiresAt > block &&
      verifyFilmCandidateTerms(candidate.entity, terms, ARC_TESTNET.id, ARC_TESTNET_USDC.address) === null;
  });
  if (!entity) {
    if (page.entities.length >= 100) throw new Error("Publication lookup budget reached; outcome remains uncertain");
    return null;
  }
  if (
    entity.$owner.toLowerCase() !== actor.toLowerCase() ||
    entity.creatorAddress.value.toLowerCase() !== actor.toLowerCase() ||
    entity.arcChainId.value !== BigInt(ARC_TESTNET.id) ||
    (entity.operationDigest?.value ?? entity.termsDigest.value) !== requestDigest
  ) {
    return null;
  }
  return { entityId: entity.$key, txHash: null };
}
