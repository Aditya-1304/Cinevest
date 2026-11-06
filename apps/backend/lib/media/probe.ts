import "server-only";
import { playbackTtlSeconds, signPlaybackToken } from "./playback-token";

/** Delivery hosts a probe may contact; manifest/segment URLs come from the provider and are never trusted blindly. */
const HOSTS = ["mux.com"];
const allowed = (url: URL) => url.protocol === "https:" && HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
const denied = (status: number) => status === 401 || status === 403;
const served = (status: number) => status === 200 || status === 206;

/** One GET with the token (if any) as Mux's `token` query parameter; anonymous requests never carry one. */
async function fetchOnce(href: string, token?: string) {
  let url = new URL(href);
  for (let hop = 0; hop < 3; hop++) {
    if (!allowed(url)) throw new Error("Playback URL host is not allowed");
    const target = new URL(url);
    target.searchParams.delete("token");
    if (token) target.searchParams.set("token", token);
    const response = await fetch(target, { headers: { range: "bytes=0-262143" }, redirect: "manual", signal: AbortSignal.timeout(8000), cache: "no-store" });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) { await response.body?.cancel(); url = new URL(location, url); continue; }
    // Only status and a bounded text prefix are needed; never buffer media bytes.
    const text = served(response.status) ? (await response.text()).slice(0, 262144) : (await response.body?.cancel(), "");
    return { status: response.status, text, url };
  }
  throw new Error("Too many playback redirects");
}

/** Resolves the first segment by walking master -> media playlist, bounded to two levels. */
async function firstSegment(manifestUrl: URL, manifest: string, token: string) {
  const first = (text: string) => text.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("#"));
  if (manifest.includes("#EXT-X-STREAM-INF")) {
    const variant = first(manifest.slice(manifest.indexOf("#EXT-X-STREAM-INF")));
    if (!variant) return null;
    const media = await fetchOnce(new URL(variant, manifestUrl).href, token);
    const segment = served(media.status) ? first(media.text) : null;
    return segment ? new URL(segment, media.url) : null;
  }
  const segment = first(manifest);
  return segment ? new URL(segment, manifestUrl) : null;
}

const flip = (token: string) => token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");

export type ProbeResult = { ok: boolean; reason?: string; checks: Record<string, number | null> };

/**
 * Probes the provider's delivery layer as an anonymous client and with signed tokens. Passing requires
 * anonymous manifest and segment access to be denied, a valid token to be served, and expired,
 * wrong-asset and badly signed tokens to be denied. This is trusted offchain evidence about Mux's
 * current behavior, not an onchain proof.
 */
export async function probePlayback(playbackId: string): Promise<ProbeResult> {
  const checks: ProbeResult["checks"] = {};
  const fail = (reason: string): ProbeResult => ({ ok: false, reason, checks });
  try {
    const manifestUrl = new URL(`https://stream.mux.com/${encodeURIComponent(playbackId)}.m3u8`);
    // Sign before starting any request so a rejection can never be left unobserved while awaiting.
    const good = (await signPlaybackToken(playbackId, playbackTtlSeconds(null))).token;
    const expiredToken = (await signPlaybackToken(playbackId, -60)).token;
    const wrongAssetToken = (await signPlaybackToken("0000000000000000", 600)).token;
    const [anon, signed, expired, wrong, tampered] = await Promise.all([
      fetchOnce(manifestUrl.href),
      fetchOnce(manifestUrl.href, good),
      fetchOnce(manifestUrl.href, expiredToken),
      fetchOnce(manifestUrl.href, wrongAssetToken),
      fetchOnce(manifestUrl.href, flip(good)),
    ]);
    Object.assign(checks, { manifestAnonymous: anon.status, manifestSigned: signed.status, manifestExpired: expired.status, manifestWrongAsset: wrong.status, manifestBadSignature: tampered.status });
    if (!denied(anon.status)) return fail("Anonymous manifest access is not denied");
    if (!served(signed.status) || !signed.text.startsWith("#EXTM3U")) return fail("Signed manifest playback is not allowed");
    if (![expired, wrong, tampered].every((result) => denied(result.status))) return fail("Expired, wrong-asset or invalid-signature token was not denied");

    const segment = await firstSegment(manifestUrl, signed.text, good);
    if (!segment) return fail("Media segment could not be located");
    const [segmentAnon, segmentSigned] = await Promise.all([fetchOnce(segment.href), fetchOnce(segment.href, good)]);
    Object.assign(checks, { segmentAnonymous: segmentAnon.status, segmentSigned: segmentSigned.status });
    if (!denied(segmentAnon.status)) return fail("Anonymous segment access is not denied");
    if (!served(segmentSigned.status)) return fail("Signed segment playback is not allowed");
    return { ok: true, checks };
  } catch {
    return fail("Playback probe could not complete");
  }
}
