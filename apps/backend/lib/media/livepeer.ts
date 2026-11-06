import "server-only";
import { z } from "zod";
import { requireServerEnv } from "@/lib/env";

const API = "https://livepeer.studio/api";

const assetSchema = z.object({
  id: z.string().min(1),
  playbackId: z.string().min(1).optional(),
  size: z.number().nonnegative().optional(),
  status: z.object({ phase: z.string() }),
  playbackPolicy: z.object({ type: z.string() }).nullish(),
});
const uploadSchema = z.object({ url: z.url(), tusEndpoint: z.url().optional(), asset: assetSchema });

/** Server-only Livepeer Studio client; the API key never leaves this module or reaches the browser. */
async function call(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${requireServerEnv("LIVEPEER_API_KEY")}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Livepeer request failed (${response.status})`);
  return response.json();
}

/** Creates a non-public asset and a direct upload URL; the video bytes never pass through this server. */
export async function requestUpload(name: string) {
  const { url, tusEndpoint, asset } = uploadSchema.parse(await call("/asset/request-upload", {
    method: "POST",
    body: JSON.stringify({ name, playbackPolicy: { type: "jwt" } }),
  }));
  return { url, tusEndpoint: tusEndpoint ?? null, assetId: asset.id, playbackId: asset.playbackId ?? null };
}

export async function getAsset(assetId: string) {
  const asset = assetSchema.parse(await call(`/asset/${encodeURIComponent(assetId)}`));
  return { phase: asset.status.phase, playbackId: asset.playbackId ?? null, size: asset.size ?? null, policyType: asset.playbackPolicy?.type ?? "public" };
}

/** Ensures the asset is gated by signed JWTs; throws unless the provider confirms the nonpublic policy. */
export async function ensureJwtPolicy(assetId: string) {
  if ((await getAsset(assetId)).policyType !== "jwt") {
    await call(`/asset/${encodeURIComponent(assetId)}`, { method: "PATCH", body: JSON.stringify({ playbackPolicy: { type: "jwt" } }) });
  }
  const { policyType } = await getAsset(assetId);
  if (policyType !== "jwt") throw new Error("Livepeer asset is not JWT-gated");
  return policyType;
}
