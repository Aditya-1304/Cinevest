import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authenticate } from "@/lib/auth/session";
import { createDatabase } from "@/lib/db";
import { mediaUploads } from "@/lib/db/schema";
import { readJson } from "@/lib/http";
import { readCampaignMedia } from "@/lib/media/arc";
import { arcChainId, campaignAddress } from "@/lib/media/input";
import { signPlaybackToken } from "@/lib/media/playback-token";
import { getRelease, playbackIdHash } from "@/lib/media/release";

const schema = z.object({ arcChainId, campaignAddress }).strict();
const headers = { "cache-control": "no-store" };

/**
 * Issues a short-lived, asset-scoped playback token to the signed-in wallet if Arc says it paid for a
 * released film. The wallet comes only from the session and the asset only from the Arc-matching
 * release, so the client cannot choose another hash or wallet. Any unverifiable state denies access.
 * Clients renew by calling this again before `refreshAt`; tokens are bearer credentials until expiry.
 */
export async function POST(request: Request) {
  const session = await authenticate(request);
  if (session instanceof NextResponse) return session;
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await readJson(request, 1024)); }
  catch { return NextResponse.json({ error: "Invalid playback request" }, { status: 400 }); }
  try {
    const campaign = await readCampaignMedia(input.campaignAddress, session.address as `0x${string}`);
    if (!campaign || !campaign.released) return NextResponse.json({ error: "Film is not available" }, { status: 404 });
    if (!campaign.paid) return NextResponse.json({ error: "Purchase required" }, { status: 403, headers });
    const release = await getRelease(input.arcChainId, input.campaignAddress);
    const [upload] = release ? await createDatabase().select().from(mediaUploads).where(eq(mediaUploads.id, release.mediaUploadId)).limit(1) : [];
    // Fail closed unless the stored selection, the recomputed hash and Arc's commitment are identical.
    if (!upload || upload.status !== "ready" || !upload.playbackId || playbackIdHash(upload.playbackId).toLowerCase() !== campaign.onchainHash
        || release?.playbackIdHash?.toLowerCase() !== campaign.onchainHash) {
      return NextResponse.json({ error: "Playback source is unavailable" }, { status: 409, headers });
    }
    return NextResponse.json({ playbackId: upload.playbackId, ...(await signPlaybackToken(upload.playbackId)) }, { headers });
  } catch { return NextResponse.json({ error: "Playback authorization unavailable", retryable: true }, { status: 503, headers }); }
}
