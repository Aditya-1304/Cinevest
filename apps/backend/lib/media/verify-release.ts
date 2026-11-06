import { logEvent } from "../log";
import "server-only";
import { type Address } from "viem";
import { checkCreRelease } from "./cre";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/lib/db";
import { mediaUploads } from "@/lib/db/schema";
import { probePlayback } from "./probe";
import { getRelease, playbackIdHash, recordProbe } from "./release";

/**
 * Final-review gate (trusted offchain evidence, not onchain proof): rechecks provider readiness, the
 * selected hash against both the database and Arc, the signed-only policy and live playback protection.
 * Throws only on provider/database unavailability; any failed check is reported and logged.
 */
export async function verifyRelease(arcChainId: string, campaignAddress: string, onchainHash: string) {
  const checks: Record<string, boolean> = {};
  const finish = (reason?: string, cre?: Awaited<ReturnType<typeof checkCreRelease>>) => {
    const ok = !reason;
    if (!ok) logEvent("warn", "media.release.verify_failed", { campaign: campaignAddress, provider: "mux", arcChainId, reason });
    return { ok, reason, evidence: "cre-cli-simulation" as const, cre, checkedAt: new Date().toISOString(), checks };
  };
  const release = await getRelease(arcChainId, campaignAddress);
  checks.selected = Boolean(release);
  if (!release) return finish("No release asset is selected");
  const [upload] = await createDatabase().select().from(mediaUploads).where(eq(mediaUploads.id, release.mediaUploadId)).limit(1);
  if (!upload?.providerAssetId || !upload.playbackId) return finish("Selected upload is missing");
  const hash = playbackIdHash(upload.playbackId).toLowerCase();
  checks.hashMatchesArc = hash === release.playbackIdHash?.toLowerCase() && hash === onchainHash;
  if (!checks.hashMatchesArc) return finish("Selected playback hash does not match Arc");
  const cre = await checkCreRelease(campaignAddress as Address, upload.providerAssetId, hash);
  checks.creReady = cre.ready;
  checks.providerReady = cre.checks.providerReady;
  checks.nonpublicPolicy = cre.checks.signedOnly;
  checks.hashMatchesArc = checks.hashMatchesArc && cre.checks.commitmentMatches;
  if (!cre.ready) return finish("CRE release conditions did not pass", cre);
  const probe = await probePlayback(upload.playbackId);
  await recordProbe(upload.id, "signed", probe, upload.playbackId);
  checks.playbackProtected = probe.ok;
  if (!probe.ok) return finish(probe.reason, cre);
  // The creator may reselect while an external check runs; never approve a superseded selection.
  const selected = await getRelease(arcChainId, campaignAddress);
  if (selected?.mediaUploadId !== release.mediaUploadId || selected?.playbackIdHash !== release.playbackIdHash)
    return finish("Release selection changed during CRE review", cre);
  if (cre.expiresAt <= Math.floor(Date.now() / 1000)) return finish("CRE review expired during playback checks", cre);
  return finish(undefined, cre);
}
