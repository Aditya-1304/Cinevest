import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth/session";
import { loadRendition, masterPlaylist } from "@/lib/viewing/hls";
import { filmInput, headers, viewingFailure } from "@/lib/viewing/http";
import { authorizeDelivery } from "@/lib/viewing/service";

type Params = { chainId: string; campaign: string; session: string; path: string[] };

const identity = z.object({ ...filmInput, session: z.uuid() });
const mediaHeaders = { "cache-control": "private, no-store" };
const playlistHeaders = { ...mediaHeaders, "content-type": "application/vnd.apple.mpegurl" };
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404, headers });

/** Streams bytes only after the ledger has funded them; these bytes must never be shared-cacheable. */
async function relay(url: string) {
  const upstream = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "media_unavailable" }, { status: 502, headers });
  return new Response(upstream.body, {
    headers: { ...mediaHeaders, "content-type": upstream.headers.get("content-type") ?? "application/octet-stream" },
  });
}

/**
 * Metered HLS gateway. Needs both the wallet cookie and that wallet's live session, so a copied URL is
 * useless. Paths: master.m3u8, r/{rendition}.m3u8, r/{rendition}/{segment}, r/{rendition}/map-{n}.
 */
export async function GET(request: Request, context: { params: Promise<Params> }) {
  const auth = await authenticate(request);
  if (auth instanceof NextResponse) return auth;
  const { chainId, campaign, session, path } = await context.params;
  const parsed = identity.safeParse({ arcChainId: chainId, campaignAddress: campaign, session });
  if (!parsed.success) return notFound();
  const sessionId = parsed.data.session;
  const key = { arcChainId: parsed.data.arcChainId, campaign: parsed.data.campaignAddress, wallet: auth.address as `0x${string}` };
  try {
    const playbackId = await authorizeDelivery(key, sessionId);
    if (path.length === 1 && path[0] === "master.m3u8") return new Response(await masterPlaylist(playbackId), { headers: playlistHeaders });
    const playlist = path.length === 2 && path[0] === "r" ? /^(\d+)\.m3u8$/.exec(path[1]) : null;
    if (playlist) {
      const rendition = await loadRendition(playbackId, Number(playlist[1]));
      return rendition ? new Response(rendition.text, { headers: playlistHeaders }) : notFound();
    }
    if (path.length !== 3 || path[0] !== "r" || !/^\d+$/.test(path[1])) return notFound();
    const rendition = await loadRendition(playbackId, Number(path[1]));
    if (!rendition) return notFound();
    const map = /^map-(\d+)$/.exec(path[2]);
    // Initialization data holds no film content, so it is the one media object served without a reservation.
    if (map) return rendition.maps[Number(map[1])] ? relay(rendition.maps[Number(map[1])]) : notFound();
    const segment = /^\d+$/.test(path[2]) ? rendition.segments[Number(path[2])] : undefined;
    if (!segment) return notFound();
    await authorizeDelivery(key, sessionId, segment);
    return await relay(segment.url);
  } catch (error) { return viewingFailure(error); }
}
