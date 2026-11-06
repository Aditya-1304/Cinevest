import "server-only";

import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, asc, eq } from "@arkiv-network/sdk/query";
import { addr, key } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { ARC_TESTNET } from "@reelance/abi";
import { getServerEnv } from "../env";
import { filmSchema } from "./film-schema";

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
    transport: http(undefined, { timeout: 5_000, retryCount: 0 }),
  });
  const filters = [];
  filters.push(eq("campaignAddress", addr(campaignAddress)));
  if (entityId) filters.push(eq("$key", key(entityId as `0x${string}`)));
  const page = await client
    .select({
      $key: true,
      $owner: true,
      arcChainId: true,
      campaignAddress: true,
      creatorAddress: true,
      termsDigest: true,
      operationDigest: true,
    })
    .from(filmSchema, { onMismatch: "throw" })
    .ownedBy(actor as `0x${string}`)
    .where(and(...filters))
    .orderBy(asc("$key"))
    .limit(entityId ? 1 : 100)
    .fetch();
  const entity = page.entities.find((row) => (row.operationDigest?.value ?? row.termsDigest.value) === requestDigest);
  if (!entity) return null;
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
