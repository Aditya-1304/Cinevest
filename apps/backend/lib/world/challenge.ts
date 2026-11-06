import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { requireServerEnv } from "@/lib/env";
import { arcChainId, campaignAddress } from "@/lib/media/input";

export const challengeInput = z.object({ arcChainId, campaignAddress }).strict();
const claims = z.object({
  wallet: z.string().regex(/^0x[0-9a-f]{40}$/), ...challengeInput.shape,
  action: z.string(), nonce: z.string(), signal: z.string(),
  environment: z.enum(["staging", "production"]),
});
const jwtScope = { issuer: "cinevest", audience: "cinevest-world-challenge" };
const key = () => new TextEncoder().encode(requireServerEnv("SESSION_SECRET"));

/** The action is stable across wallets and retries; only the signal includes the fresh RP nonce. */
export async function issueWorldChallenge(wallet: string, input: z.infer<typeof challengeInput>) {
  const appId = z.string().regex(/^app_[a-zA-Z0-9]+$/).parse(requireServerEnv("WORLD_APP_ID"));
  const rpId = z.string().regex(/^rp_[a-zA-Z0-9]+$/).parse(requireServerEnv("WORLD_RP_ID"));
  const environment = z.enum(["staging", "production"]).parse(process.env.WORLD_ENVIRONMENT ?? "staging");
  const action = `${requireServerEnv("WORLD_ACTION")}:${input.arcChainId}:${input.campaignAddress}`;
  const signed = signRequest({ action, signingKeyHex: requireServerEnv("WORLD_RP_SIGNING_KEY"), ttl: 300 });
  const signal = `cinevest:world:v1:${input.arcChainId}:${input.campaignAddress}:${wallet}:${signed.nonce}`;
  const context = { ...input, wallet, action, signal, nonce: signed.nonce, environment };
  const token = await new SignJWT(context).setProtectedHeader({ alg: "HS256" })
    .setIssuer(jwtScope.issuer).setAudience(jwtScope.audience).setIssuedAt(signed.createdAt)
    .setExpirationTime(signed.expiresAt).sign(key());
  return { ...context, token, appId, rp_context: {
    rp_id: rpId, nonce: signed.nonce, created_at: signed.createdAt,
    expires_at: signed.expiresAt, signature: signed.sig,
  } };
}

/** Checks context only. P9.4 must still cryptographically verify the proof before trusting its nullifier. */
export async function validateWorldContext(wallet: string, token: string, proof: unknown) {
  const { payload } = await jwtVerify(token, key(), { ...jwtScope, algorithms: ["HS256"] });
  const context = claims.parse(payload);
  if (context.wallet !== wallet) throw new Error("Wallet does not match challenge");
  const response = z.object({
    protocol_version: z.literal("4.0"), nonce: z.literal(context.nonce),
    action: z.literal(context.action), environment: z.literal(context.environment),
    responses: z.array(z.object({ identifier: z.literal("proof_of_human"),
      issuer_schema_id: z.literal(1), signal_hash: z.literal(hashSignal(context.signal)),
      nullifier: z.string().regex(/^\d+$/), proof: z.array(z.string()).length(5),
    })).length(1),
  }).parse(proof);
  return { context, response };
}
