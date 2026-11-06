import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authenticate } from "@/lib/auth/session";
import { createDatabase } from "@/lib/db";
import { mediaUploads } from "@/lib/db/schema";
import { readJson } from "@/lib/http";
import { readCampaignMedia } from "@/lib/media/arc";
import { arcChainId, campaignAddress } from "@/lib/media/input";
import { reconcileUpload } from "@/lib/media/reconcile";
import { ensureSignedPolicy } from "@/lib/media/mux";
import { probePlayback } from "@/lib/media/probe";
import { getRelease, lockRelease, recordProbe, selectRelease } from "@/lib/media/release";

const headers = { "cache-control": "no-store" };
const selectSchema = z.object({ arcChainId, campaignAddress, uploadId: z.uuid() }).strict();
const querySchema = z.object({ arcChainId, campaignAddress });

/** Public: reports the selected release hash, lock state and whether it matches the Arc commitment. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse({ arcChainId: params.get("arcChainId"), campaignAddress: params.get("campaignAddress") });
  if (!query.success) return NextResponse.json({ error: "Invalid release query" }, { status: 400 });
  try {
    const campaign = await readCampaignMedia(query.data.campaignAddress);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (campaign.locked) await lockRelease(query.data.arcChainId, query.data.campaignAddress);
    const release = await getRelease(query.data.arcChainId, query.data.campaignAddress);
    return NextResponse.json({
      selected: Boolean(release), playbackIdHash: release?.playbackIdHash ?? null,
      locked: Boolean(release?.lockedAt) || campaign.locked,
      matchesArc: Boolean(release?.playbackIdHash) && release?.playbackIdHash?.toLowerCase() === campaign.onchainHash,
    }, { headers });
  } catch { return NextResponse.json({ error: "Release status unavailable", retryable: true }, { status: 503 }); }
}

/** Creator-only: selects exactly one provider-ready upload and returns the hash to pass to configureRelease. */
export async function POST(request: Request) {
  const session = await authenticate(request);
  if (session instanceof NextResponse) return session;
  let input: z.infer<typeof selectSchema>;
  try { input = selectSchema.parse(await readJson(request, 2048)); }
  catch { return NextResponse.json({ error: "Invalid release request" }, { status: 400 }); }
  try {
    const campaign = await readCampaignMedia(input.campaignAddress);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (campaign.creator !== session.address) return NextResponse.json({ error: "Only the campaign creator may select the release" }, { status: 403 });
    if (campaign.locked) {
      await lockRelease(input.arcChainId, input.campaignAddress);
      return NextResponse.json({ error: "Release selection is locked after final approval" }, { status: 409 });
    }
    const [upload] = await createDatabase().select().from(mediaUploads).where(eq(mediaUploads.id, input.uploadId)).limit(1);
    if (!upload || upload.ownerWallet !== session.address || upload.campaignAddress !== input.campaignAddress || upload.arcChainId !== input.arcChainId) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    }
    // Recheck readiness with the provider so a stale local status can never be selected.
    const { row, stale } = await reconcileUpload(upload);
    if (stale) return NextResponse.json({ error: "Provider status unavailable", retryable: true }, { status: 503 });
    if (row.status !== "ready" || !row.playbackId) return NextResponse.json({ error: "Upload is not ready", status: row.status }, { status: 409 });
    // Signed-only policy and live delivery probe must both pass before the hash for configureRelease is handed out.
    if (!row.providerAssetId) return NextResponse.json({ error: "Upload is not ready", status: row.status }, { status: 409 });
    const playbackId = await ensureSignedPolicy(row.providerAssetId);
    const probe = await probePlayback(playbackId);
    await recordProbe(row.id, "signed", probe, playbackId);
    if (!probe.ok) return NextResponse.json({ error: "Playback protection check failed", reason: probe.reason, checks: probe.checks }, { status: 409 });
    const release = await selectRelease(input.arcChainId, input.campaignAddress, row.id, playbackId);
    if (!release) return NextResponse.json({ error: "Release selection is locked" }, { status: 409 });
    return NextResponse.json({ uploadId: row.id, playbackIdHash: release.playbackIdHash }, { headers });
  } catch { return NextResponse.json({ error: "Release selection unavailable", retryable: true }, { status: 503 }); }
}
