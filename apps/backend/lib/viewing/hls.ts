import "server-only";
import { signPlaybackToken } from "@/lib/media/playback-token";

/**
 * Metering gateway view of a Mux HLS asset. Instant-clip tokens only trim manifests, so viewers instead
 * get playlists whose every URI points back at this backend: Mux URLs and tokens never reach a browser,
 * and each segment is released only after the ledger funds it.
 */
const CACHE_MS = 5 * 60 * 1000;
const TOKEN_TTL_SECONDS = 30 * 60;
const MAX_CACHED_FILMS = 32;
const DROPPED_TAG = /^#EXT-X-(I-FRAME-STREAM-INF|IMAGE-STREAM-INF|SESSION-DATA|SESSION-KEY)/;

export type Segment = { url: string; start: number; end: number };
type Rendition = { text: string; segments: Segment[]; maps: string[] };
type Film = { expires: number; text: string; renditions: string[]; loaded: Map<number, Rendition> };

const films = new Map<string, Film>();

async function fetchPlaylist(url: string) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Mux playlist request failed (${response.status})`);
  return response.text();
}

export function upstreamUrl(uri: string, base: string) {
  const url = new URL(uri, base);
  if (url.protocol !== "https:" || !(url.hostname === "mux.com" || url.hostname.endsWith(".mux.com"))) {
    throw new Error("Unexpected media host");
  }
  return url.href;
}

/** Fails closed on any URI-bearing line this rewrite does not understand, rather than leak it. */
function assertSealed(line: string) {
  if (/URI\s*=/i.test(line) || /BYTERANGE|EXT-X-KEY/.test(line)) throw new Error("Unsupported playlist feature");
}

function rewriteMaster(body: string, base: string) {
  const renditions: string[] = [];
  const local = (uri: string) => `r/${renditions.push(upstreamUrl(uri, base)) - 1}.m3u8`;
  const text = body.split(/\r?\n/).flatMap((line) => {
    if (DROPPED_TAG.test(line)) return [];
    if (line.startsWith("#EXT-X-MEDIA:")) {
      assertSealed(line.replace(/URI="[^"]+"/, ""));
      return [line.replace(/URI="([^"]+)"/, (_, uri: string) => `URI="${local(uri)}"`)];
    }
    if (line && !line.startsWith("#")) return [local(line)];
    if (line.startsWith("#")) assertSealed(line);
    return [line];
  }).join("\n");
  return { text, renditions };
}

function rewriteRendition(body: string, base: string, index: number): Rendition {
  const segments: Segment[] = [];
  const maps: string[] = [];
  let start = 0;
  let duration = Number.NaN;
  const text = body.split(/\r?\n/).map((line) => {
    if (line.startsWith("#EXT-X-MAP:")) {
      assertSealed(line.replace(/URI="[^"]+"/, ""));
      return line.replace(/URI="([^"]+)"/, (_, uri: string) => `URI="${index}/map-${maps.push(upstreamUrl(uri, base)) - 1}"`);
    }
    if (line.startsWith("#EXTINF:")) duration = Number.parseFloat(line.slice(8));
    if (line.startsWith("#")) { assertSealed(line); return line; }
    if (!line) return line;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid segment duration");
    segments.push({ url: upstreamUrl(line, base), start, end: start + duration });
    start += duration;
    duration = Number.NaN;
    return `${index}/${segments.length - 1}`;
  }).join("\n");
  return { text, segments, maps };
}

async function loadFilm(playbackId: string) {
  const cached = films.get(playbackId);
  if (cached && cached.expires > Date.now()) return cached;
  const { token } = await signPlaybackToken(playbackId, TOKEN_TTL_SECONDS);
  const url = `https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8?token=${token}`;
  const film = { ...rewriteMaster(await fetchPlaylist(url), url), expires: Date.now() + CACHE_MS, loaded: new Map() };
  if (films.size >= MAX_CACHED_FILMS) films.clear();
  films.set(playbackId, film);
  return film;
}

export const masterPlaylist = async (playbackId: string) => (await loadFilm(playbackId)).text;

/** Returns null for an index the master playlist never advertised. */
export async function loadRendition(playbackId: string, index: number) {
  const film = await loadFilm(playbackId);
  const url = film.renditions[index];
  if (!url) return null;
  const loaded = film.loaded.get(index);
  if (loaded) return loaded;
  const rendition = rewriteRendition(await fetchPlaylist(url), url, index);
  film.loaded.set(index, rendition);
  return rendition;
}
