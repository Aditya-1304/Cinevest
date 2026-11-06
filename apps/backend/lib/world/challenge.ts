import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { createWorldStore } from "./store";
import { requireServerEnv } from "@/lib/env";
import { arcChainId, campaignAddress } from "@/lib/media/input";

export const challengeInput = z.object({ arcChainId, campaignAddress }).strict();
const claims = z.object({
  wallet: z.string().regex(/^0x[0-9a-f]{40}$/), ...challengeInput.shape,
  rpId: z.string().regex(/^rp_[a-zA-Z0-9]+$/),
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
  const context = { ...input, wallet, rpId, action, signal, nonce: signed.nonce, environment };
  const token = await new SignJWT(context).setProtectedHeader({ alg: "HS256" })
    .setIssuer(jwtScope.issuer).setAudience(jwtScope.audience).setIssuedAt(signed.createdAt)
    .setExpirationTime(signed.expiresAt).sign(key());
  await createWorldStore().issue(context, token, signed.expiresAt);
  return { ...context, token, appId, rp_context: {
    rp_id: rpId, nonce: signed.nonce, created_at: signed.createdAt,
    expires_at: signed.expiresAt, signature: signed.sig,
  } };
}

/** Accept both official decimal SDK fields and hex API fields, with a uint256 bound before encoding. */
export const worldUint256 = z.string().refine((value) =>
  value.length <= 80 && /^(?:[0-9]+|0x[0-9a-fA-F]+)$/.test(value) && BigInt(value) < 2n ** 256n,
  "Expected a uint256 decimal or hexadecimal string",
);

/** Context validation precedes the official verifier; it never establishes proof validity by itself. */
export async function validateWorldContext(wallet: string, token: string, proof: unknown) {
  const context = await readWorldContext(wallet, token);
  const response = z.object({
    session_id: z.never().optional(),
    protocol_version: z.literal("4.0"), nonce: z.literal(context.nonce),
    action: z.literal(context.action), environment: z.literal(context.environment),
    responses: z.array(z.object({ identifier: z.literal("proof_of_human"),
      issuer_schema_id: z.literal(1),
      signal_hash: worldUint256.pipe(z.string().refine((value) => BigInt(value) === BigInt(hashSignal(context.signal)))),
      nullifier: worldUint256.pipe(z.string().refine((value) => BigInt(value) !== 0n)),
      expires_at_min: z.number().int().safe().positive().max(8_640_000_000_000),
      proof: z.array(worldUint256).length(5),
    }).passthrough()).length(1),
  }).passthrough().parse(proof);
  return { context, response };
}

/** Also used by token-only permission recovery; proof verification remains a separate boundary. */
export async function readWorldContext(wallet: string, token: string) {
  const { payload } = await jwtVerify(token, key(), { ...jwtScope, algorithms: ["HS256"] });
  const context = claims.parse(payload);
  if (context.wallet !== wallet) throw new Error("Wallet does not match challenge");
  return context;
}
