import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth/session";
import { readJson } from "@/lib/http";
import { readCampaignMedia } from "@/lib/media/arc";
import { arcChainId, campaignAddress } from "@/lib/media/input";
import { playbackTtlSeconds, signPlaybackToken } from "@/lib/media/playback-token";
import { playableUpload } from "@/lib/media/release";

const schema = z.object({ arcChainId, campaignAddress }).strict();
const headers = { "cache-control": "no-store" };

/**
 * Issues a short-lived, asset-scoped playback token to the signed-in wallet if Arc says it paid for a
 * released film. The wallet comes only from the session and the asset only from the Arc-matching
 * release, so the client cannot choose another hash or wallet. Any unverifiable state denies access.
 * The token outlives the film (Mux embeds it in segment URLs); it is a bearer credential until expiry.
 * A viewer whose token lapsed (long pause, reload) simply calls this again.
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
    const upload = await playableUpload(input.arcChainId, input.campaignAddress, campaign.onchainHash);
    if (!upload?.playbackId) return NextResponse.json({ error: "Playback source is unavailable" }, { status: 409, headers });
    return NextResponse.json({ playbackId: upload.playbackId, ...(await signPlaybackToken(upload.playbackId, playbackTtlSeconds(upload.durationSeconds))) }, { headers });
  } catch { return NextResponse.json({ error: "Playback authorization unavailable", retryable: true }, { status: 503, headers }); }
}
