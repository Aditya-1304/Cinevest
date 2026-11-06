import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { keccak256, stringToBytes } from "viem";
import { createDatabase } from "@/lib/db";
import { campaignMediaRelease } from "@/lib/db/schema";

/** Canonical Arc commitment: keccak256 over the UTF-8 bytes of the playback ID, equal to Solidity keccak256(bytes(id)). */
export const playbackIdHash = (playbackId: string) => keccak256(stringToBytes(playbackId));

const identity = (arcChainId: string, campaignAddress: string) =>
  and(eq(campaignMediaRelease.arcChainId, arcChainId), eq(campaignMediaRelease.campaignAddress, campaignAddress));

export async function getRelease(arcChainId: string, campaignAddress: string) {
  const [row] = await createDatabase().select().from(campaignMediaRelease).where(identity(arcChainId, campaignAddress)).limit(1);
  return row ?? null;
}

/** Freezes an existing selection once Arc shows final review has locked configureRelease. */
export async function lockRelease(arcChainId: string, campaignAddress: string) {
  await createDatabase().update(campaignMediaRelease).set({ lockedAt: new Date() })
    .where(and(identity(arcChainId, campaignAddress), isNull(campaignMediaRelease.lockedAt)));
}

/** Selects (or re-selects while unlocked) the single ready upload; returns null if the selection is locked. */
export async function selectRelease(arcChainId: string, campaignAddress: string, mediaUploadId: string, playbackId: string) {
  const hash = playbackIdHash(playbackId);
  const [row] = await createDatabase().insert(campaignMediaRelease)
    .values({ arcChainId, campaignAddress, mediaUploadId, playbackIdHash: hash })
    .onConflictDoUpdate({
      target: [campaignMediaRelease.arcChainId, campaignMediaRelease.campaignAddress],
      set: { mediaUploadId, playbackIdHash: hash, selectedAt: new Date() },
      setWhere: isNull(campaignMediaRelease.lockedAt),
    }).returning();
  return row ?? null;
}
