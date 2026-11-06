import "server-only";
import { createPrivateKey } from "node:crypto";
import { SignJWT } from "jose";
import { requireServerEnv } from "@/lib/env";

const MIN_TTL_SECONDS = 15 * 60;
const MAX_TTL_SECONDS = 6 * 60 * 60;

/**
 * Mux embeds the token in the HLS child-playlist and segment URLs, so it must outlive the whole film
 * rather than be renewed mid-playback. Lifetime is the film length plus a margin, bounded above.
 */
export function playbackTtlSeconds(durationSeconds: number | null) {
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, (durationSeconds ?? 2 * 60 * 60) + MIN_TTL_SECONDS));
}

/**
 * Signs a Mux signed-playback JWT: RS256, `sub` = playback ID, `aud` = "v" (video), `kid` = signing key.
 * Mux validates it at the CDN per request, so it is scoped to one asset and fails once expired.
 *
 * Rotation: create a new Mux signing key, switch MUX_SIGNING_KEY_ID and MUX_SIGNING_PRIVATE_KEY, and delete the
 * old key only after the longest outstanding token (MAX_TTL_SECONDS) has expired.
 */
export async function signPlaybackToken(playbackId: string, ttlSeconds: number) {
  const kid = requireServerEnv("MUX_SIGNING_KEY_ID");
  const pem = requireServerEnv("MUX_SIGNING_PRIVATE_KEY");
  const privateKey = createPrivateKey(pem.includes("BEGIN") ? pem : Buffer.from(pem, "base64").toString("utf8"));
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await new SignJWT({ kid }).setProtectedHeader({ alg: "RS256", typ: "JWT", kid })
    .setSubject(playbackId).setAudience("v").setExpirationTime(exp).sign(privateKey);
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}
