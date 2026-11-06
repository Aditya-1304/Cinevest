import "server-only";
import { z } from "zod";
import { requireServerEnv } from "@/lib/env";

const API = "https://api.mux.com/video/v1";

/** Server-only Mux client; API credentials never leave this module or reach the browser. */
async function call(path: string, init?: RequestInit) {
  const auth = Buffer.from(`${requireServerEnv("MUX_TOKEN_ID")}:${requireServerEnv("MUX_TOKEN_SECRET")}`).toString("base64");
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Mux request failed (${response.status})`);
  return response.status === 204 ? {} : response.json();
}

const wrap = <T extends z.ZodType>(data: T) => z.object({ data });
const playbackIds = z.array(z.object({ id: z.string().min(1), policy: z.string() }));
const uploadSchema = wrap(z.object({ id: z.string().min(1), url: z.url().optional(), status: z.string(), asset_id: z.string().optional() }));
const assetSchema = wrap(z.object({ id: z.string().min(1), status: z.string(), duration: z.number().nonnegative().optional(), playback_ids: playbackIds.optional() }));

/** Creates a direct-upload URL for a signed-only asset; the video bytes never pass through this server. */
export async function createUpload(passthrough: string) {
  const body = await call("/uploads", {
    method: "POST",
    body: JSON.stringify({
      cors_origin: new URL(requireServerEnv("APP_URL")).origin,
      new_asset_settings: { playback_policies: ["signed"], video_quality: "basic", passthrough },
    }),
  });
  const { data } = uploadSchema.parse(body);
  if (!data.url) throw new Error("Mux upload URL missing");
  return { uploadId: data.id, url: data.url };
}

export async function getUpload(uploadId: string) {
  const body = await call(`/uploads/${encodeURIComponent(uploadId)}`);
  if (!body) return null;
  const { data } = uploadSchema.parse(body);
  return { status: data.status, assetId: data.asset_id ?? null };
}

/** Returns null when the asset no longer exists, so deletion is distinguishable from an outage. */
export async function getAsset(assetId: string) {
  const body = await call(`/assets/${encodeURIComponent(assetId)}`);
  if (!body) return null;
  const { data } = assetSchema.parse(body);
  const ids = data.playback_ids ?? [];
  return {
    status: data.status,
    duration: data.duration ?? null,
    signedPlaybackId: ids.find((id) => id.policy === "signed")?.id ?? null,
    hasPublicPlayback: ids.some((id) => id.policy === "public"),
  };
}

/** Makes the asset signed-only: removes any public playback ID and adds a signed one if absent. Returns the signed ID. */
export async function ensureSignedPolicy(assetId: string) {
  const body = await call(`/assets/${encodeURIComponent(assetId)}`);
  if (!body) throw new Error("Mux asset not found");
  const ids = assetSchema.parse(body).data.playback_ids ?? [];
  if (!ids.some((id) => id.policy === "signed")) {
    await call(`/assets/${encodeURIComponent(assetId)}/playback-ids`, { method: "POST", body: JSON.stringify({ policy: "signed" }) });
  }
  for (const id of ids.filter((item) => item.policy === "public")) {
    await call(`/assets/${encodeURIComponent(assetId)}/playback-ids/${encodeURIComponent(id.id)}`, { method: "DELETE" });
  }
  const asset = await getAsset(assetId);
  if (!asset?.signedPlaybackId || asset.hasPublicPlayback) throw new Error("Mux asset is not signed-only");
  return asset.signedPlaybackId;
}
