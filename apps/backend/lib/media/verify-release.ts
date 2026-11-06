import { logEvent } from "../log";
import "server-only";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/lib/db";
import { mediaUploads } from "@/lib/db/schema";
import { getAsset } from "./mux";
import { probePlayback } from "./probe";
import { getRelease, playbackIdHash, recordProbe } from "./release";

/**
 * Final-review gate (trusted offchain evidence, not onchain proof): rechecks provider readiness, the
 * selected hash against both the database and Arc, the signed-only policy and live playback protection.
 * Throws only on provider/database unavailability; any failed check is reported and logged.
 */
export async function verifyRelease(arcChainId: string, campaignAddress: string, onchainHash: string) {
  const checks: Record<string, boolean> = {};
  const finish = (reason?: string) => {
    const ok = !reason;
    if (!ok) logEvent("warn", "media.release.verify_failed", { campaign: campaignAddress, provider: "mux", arcChainId, reason });
    return { ok, reason, evidence: "trusted-offchain" as const, checkedAt: new Date().toISOString(), checks };
  };
  const release = await getRelease(arcChainId, campaignAddress);
  checks.selected = Boolean(release);
  if (!release) return finish("No release asset is selected");
  const [upload] = await createDatabase().select().from(mediaUploads).where(eq(mediaUploads.id, release.mediaUploadId)).limit(1);
  if (!upload?.providerAssetId || !upload.playbackId) return finish("Selected upload is missing");
  const asset = await getAsset(upload.providerAssetId);
  checks.providerReady = asset?.status === "ready" && asset.signedPlaybackId === upload.playbackId;
  if (!asset || !checks.providerReady) return finish("Provider asset is missing, not ready, or its playback ID changed");
  checks.nonpublicPolicy = !asset.hasPublicPlayback;
  if (!checks.nonpublicPolicy) return finish("Provider asset has a public playback ID");
  const hash = playbackIdHash(upload.playbackId).toLowerCase();
  checks.hashMatchesArc = hash === release.playbackIdHash?.toLowerCase() && hash === onchainHash;
  if (!checks.hashMatchesArc) return finish("Selected playback hash does not match Arc");
  const probe = await probePlayback(upload.playbackId);
  await recordProbe(upload.id, "signed", probe, upload.playbackId);
  checks.playbackProtected = probe.ok;
  return finish(probe.ok ? undefined : probe.reason);
}
