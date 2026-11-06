import "server-only";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { SignJWT } from "jose";
import { requireServerEnv } from "@/lib/env";

/** Bearer token lifetime; clients renew before expiry. Bounded so a leaked or shared token stops working quickly. */
export const PLAYBACK_TOKEN_TTL_SECONDS = 300;

const pem = (value: string) => (value.includes("BEGIN") ? value : Buffer.from(value, "base64").toString("utf8"));

/**
 * Signs a Livepeer access JWT in the format of the official @livepeer/core signAccessJwt: ES256,
 * claims action/iss/pub/sub/video/exp/iat, bound to one playback ID. The signing key pair must match,
 * so a misconfigured or half-rotated key fails closed here instead of minting tokens Livepeer rejects.
 *
 * Rotation: register the new public key in Livepeer Studio, switch both env values, then delete the
 * old key only after PLAYBACK_TOKEN_TTL_SECONDS has elapsed so in-flight tokens finish validating.
 */
export async function signPlaybackToken(playbackId: string, ttlSeconds = PLAYBACK_TOKEN_TTL_SECONDS) {
  const privateKey = createPrivateKey(pem(requireServerEnv("LIVEPEER_SIGNING_KEY")));
  const publicValue = requireServerEnv("LIVEPEER_SIGNING_PUBLIC_KEY");
  const expected = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  if (!createPublicKey(pem(publicValue)).export({ type: "spki", format: "der" }).equals(expected)) {
    throw new Error("Livepeer signing key pair mismatch");
  }
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const token = await new SignJWT({ action: "pull", iss: new URL(requireServerEnv("APP_URL")).origin,
    pub: publicValue.includes("BEGIN") ? Buffer.from(publicValue).toString("base64") : publicValue, sub: playbackId, video: "none" })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" }).setIssuedAt(iat).setExpirationTime(exp).sign(privateKey);
  return { token, expiresAt: new Date(exp * 1000).toISOString(), refreshAt: new Date((exp - 60) * 1000).toISOString() };
}
