import "server-only";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/lib/db";
import { mediaUploads } from "@/lib/db/schema";
import { getAsset } from "./livepeer";
import { probePlayback } from "./probe";
import { getRelease, playbackIdHash, recordProbe } from "./release";

/**
 * Final-review gate (trusted offchain evidence, not onchain proof): rechecks provider readiness, the
 * selected hash against both the database and Arc, the nonpublic policy and live playback protection.
 * Throws only on provider/database unavailability; any failed check is reported and logged.
 */
export async function verifyRelease(arcChainId: string, campaignAddress: string, onchainHash: string) {
  const checks: Record<string, boolean> = {};
  const finish = (reason?: string) => {
    const ok = !reason;
    if (!ok) console.warn(JSON.stringify({ event: "media.release.verify_failed", arcChainId, campaignAddress, reason }));
    return { ok, reason, evidence: "trusted-offchain" as const, checkedAt: new Date().toISOString(), checks };
  };
  const release = await getRelease(arcChainId, campaignAddress);
  checks.selected = Boolean(release);
  if (!release) return finish("No release asset is selected");
  const [upload] = await createDatabase().select().from(mediaUploads).where(eq(mediaUploads.id, release.mediaUploadId)).limit(1);
  if (!upload?.providerAssetId || !upload.playbackId) return finish("Selected upload is missing");
  const asset = await getAsset(upload.providerAssetId);
  const playbackId = asset.playbackId;
  checks.providerReady = asset.phase === "ready" && playbackId === upload.playbackId;
  if (!playbackId || !checks.providerReady) return finish("Provider asset is not ready or its playback ID changed");
  checks.nonpublicPolicy = asset.policyType === "jwt";
  if (!checks.nonpublicPolicy) return finish("Provider asset policy is not JWT-gated");
  const hash = playbackIdHash(playbackId).toLowerCase();
  checks.hashMatchesArc = hash === release.playbackIdHash?.toLowerCase() && hash === onchainHash;
  if (!checks.hashMatchesArc) return finish("Selected playback hash does not match Arc");
  const probe = await probePlayback(playbackId);
  await recordProbe(upload.id, asset.policyType, probe);
  checks.playbackProtected = probe.ok;
  return finish(probe.ok ? undefined : probe.reason);
}
