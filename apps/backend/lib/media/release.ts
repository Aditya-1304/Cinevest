import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { keccak256, stringToBytes } from "viem";
import { createDatabase } from "@/lib/db";
import { campaignMediaRelease, mediaUploads } from "@/lib/db/schema";
import type { ProbeResult } from "./probe";

/** Canonical Arc commitment: keccak256 over the UTF-8 bytes of the playback ID, equal to Solidity keccak256(bytes(id)). */
export const playbackIdHash = (playbackId: string) => keccak256(stringToBytes(playbackId));

const identity = (arcChainId: string, campaignAddress: string) =>
  and(eq(campaignMediaRelease.arcChainId, arcChainId), eq(campaignMediaRelease.campaignAddress, campaignAddress));

export async function getRelease(arcChainId: string, campaignAddress: string) {
  const [row] = await createDatabase().select().from(campaignMediaRelease).where(identity(arcChainId, campaignAddress)).limit(1);
  return row ?? null;
}

/** Fails closed unless the stored selection, the recomputed hash and Arc's commitment are identical. */
export async function playableUpload(arcChainId: string, campaignAddress: string, onchainHash: string) {
  const release = await getRelease(arcChainId, campaignAddress);
  const [upload] = release ? await createDatabase().select().from(mediaUploads).where(eq(mediaUploads.id, release.mediaUploadId)).limit(1) : [];
  if (!upload || upload.status !== "ready" || !upload.playbackId || playbackIdHash(upload.playbackId).toLowerCase() !== onchainHash
      || release?.playbackIdHash?.toLowerCase() !== onchainHash) return null;
  return upload;
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

/** Records the provider policy, confirmed signed playback ID and delivery probe outcome (tokens and URLs are never stored). */
export async function recordProbe(uploadId: string, policyType: string, probe: ProbeResult, playbackId: string) {
  await createDatabase().update(mediaUploads).set({ policyType, playbackId, probeResult: probe, probedAt: new Date() }).where(eq(mediaUploads.id, uploadId));
}
