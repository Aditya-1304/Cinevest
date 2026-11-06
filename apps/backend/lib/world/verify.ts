import "server-only";
import { z } from "zod";
import { encodeAbiParameters, keccak256 } from "viem";
import { requireServerEnv } from "@/lib/env";
import { validateWorldContext, worldUint256 } from "./challenge";
import { WorldError } from "./error";
import { createWorldStore, worldHash } from "./store";

const resultSchema = z.object({
  success: z.literal(true), action: z.string().optional(), environment: z.string().optional(),
  nullifier: worldUint256.optional(),
  results: z.array(z.object({
    success: z.literal(true), identifier: z.string().optional(), nullifier: worldUint256.optional(),
  })).length(1),
});

/** Forward the complete IDKit response; the World API verifies the submitted signal and credential cryptographically. */
export async function verifyWorldProof(wallet: string, token: string, proof: unknown,
  dependencies = { store: createWorldStore(), fetch: globalThis.fetch }) {
  let validated;
  try { validated = await validateWorldContext(wallet, token, proof); }
  catch { throw new WorldError("Expired challenge or mismatched proof context", 400); }
  const { context, response } = validated;
  if (context.rpId !== requireServerEnv("WORLD_RP_ID")
      || context.environment !== (process.env.WORLD_ENVIRONMENT ?? "staging")) {
    throw new WorldError("World configuration changed; request a fresh challenge", 400);
  }
  const credential = response.responses[0];
  if (credential.expires_at_min <= Math.floor(Date.now() / 1000)) throw new WorldError("World credential expired", 400);
  await dependencies.store.requireUnused(context, token);

  let result: unknown;
  try {
    const verified = await dependencies.fetch(`https://developer.world.org/api/v4/verify/${context.rpId}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(proof),
      signal: AbortSignal.timeout(10_000), cache: "no-store", redirect: "error",
    });
    if (verified.status === 429 || verified.status >= 500) throw new WorldError("World verification temporarily unavailable", 503);
    if (!verified.ok) throw new WorldError("World proof rejected", 400);
    result = await verified.json();
  } catch (error) {
    if (error instanceof WorldError) throw error;
    throw new WorldError("World verification temporarily unavailable", 503);
  }
  const parsed = resultSchema.safeParse(result);
  if (!parsed.success) throw new WorldError("World proof was not verified", 400);
  const verified = parsed.data;
  const item = verified.results[0];
  if ((verified.action !== undefined && verified.action !== context.action)
      || (verified.environment !== undefined && verified.environment !== context.environment)
      || (item.identifier !== undefined && item.identifier !== "proof_of_human")
      || [item.nullifier, verified.nullifier].some((value) => value !== undefined && BigInt(value) !== BigInt(credential.nullifier))) {
    throw new WorldError("World verification result does not match request", 400);
  }
  const scopedNullifierHash = keccak256(encodeAbiParameters(
    [{ type: "string" }, { type: "uint256" }, { type: "uint256" }],
    [context.rpId, BigInt(credential.issuer_schema_id), BigInt(credential.nullifier)],
  ));
  // Normalize numeric fields so decimal/hex formatting cannot create a second proof fingerprint.
  const proofHash = worldHash(JSON.stringify([
    context.rpId, context.environment, context.action, context.nonce,
    BigInt(credential.signal_hash).toString(), BigInt(credential.nullifier).toString(),
    credential.expires_at_min, credential.proof.map((value) => BigInt(value).toString()),
  ]));
  const verificationId = await dependencies.store.consume(context, token, scopedNullifierHash, proofHash, credential.expires_at_min);
  return { verified: true, verificationId, arcChainId: context.arcChainId, campaignAddress: context.campaignAddress,
    wallet: context.wallet, environment: context.environment, scopedNullifierHash };
}
