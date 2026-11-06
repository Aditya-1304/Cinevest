import { ChunkSplitter } from "@ethersphere/core-sdk";
import { z } from "zod";

export const MAX_MANIFEST_BYTES = 256 * 1024;
export const MAX_POSTER_BYTES = 5 * 1024 * 1024;
export const SAFE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const safeImageTypes = new Set<string>(SAFE_IMAGE_TYPES);
const pitchManifest = z.object({
  schema: z.literal("clipstake.pitch.v1"),
  manifestVersion: z.literal(1),
  title: z.string().min(1).max(256),
  genre: z.string().min(1).max(128),
  pitch: z.string().min(1).max(16_384),
}).strict();
const milestoneManifest = z.object({
  schema: z.literal("clipstake.milestone.v1"),
  manifestVersion: z.literal(1),
  campaignAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  milestoneIndex: z.union([z.literal(1), z.literal(2)]),
  evidenceFiles: z.array(z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/)).min(1).max(32),
  submittedAt: z.number().int().positive().safe(),
  text: z.string().min(1).max(16_384),
}).strict();

export class ArtifactUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactUnavailableError";
  }
}

export class ArtifactInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactInvalidError";
  }
}

export function normalizeArtifactReference(value: unknown): `0x${string}` | null {
  if (typeof value !== "string") return null;
  const hex = value.replace(/^0x/i, "");
  return /^[0-9a-fA-F]{64}$/.test(hex) ? `0x${hex.toLowerCase()}` : null;
}

export function buildGatewayUrl(gatewayBase: string, referenceInput: string) {
  const reference = normalizeArtifactReference(referenceInput);
  if (!reference) throw new ArtifactInvalidError("Swarm reference must be 32 bytes");
  let base: URL;
  try {
    base = new URL(gatewayBase);
  } catch {
    throw new ArtifactUnavailableError("Configured Swarm gateway URL is invalid");
  }
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new ArtifactUnavailableError("Configured Swarm gateway URL is invalid");
  }
  return new URL(`/bytes/${reference.slice(2)}`, base.origin);
}

export function isManifestContentType(value: string | null) {
  const type = value?.split(";", 1)[0].trim().toLowerCase();
  return type === "application/json" || type === "application/octet-stream";
}

export function normalizeImageContentType(value: string | null) {
  const type = value?.split(";", 1)[0].trim().toLowerCase();
  return type && safeImageTypes.has(type) ? type : null;
}

export async function readBounded(response: Response, limit: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new ArtifactInvalidError("Swarm artifact exceeds the size limit");
  }
  if (!response.body) throw new ArtifactInvalidError("Swarm gateway returned an empty response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new ArtifactInvalidError("Swarm artifact exceeds the size limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function referenceMatches(bytes: Uint8Array, referenceInput: string) {
  const reference = normalizeArtifactReference(referenceInput);
  if (!reference) return false;
  const root = await ChunkSplitter.root(bytes);
  return root.hash().toHex().replace(/^0x/i, "").toLowerCase() === reference.slice(2).toLowerCase();
}

export function decodeManifestJson(bytes: Uint8Array) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new ArtifactInvalidError("Swarm manifest is not valid UTF-8 JSON");
  }
}

export function parsePitchManifest(value: unknown) {
  const manifest = pitchManifest.safeParse(value);
  if (!manifest.success) {
    throw new ArtifactInvalidError("Swarm pitch manifest has an unsupported schema or version");
  }
  return manifest.data;
}

export function parseMilestoneManifest(value: unknown, campaignAddress: string, milestoneIndex: number) {
  const manifest = milestoneManifest.safeParse(value);
  if (
    !manifest.success ||
    !/^0x[0-9a-fA-F]{40}$/.test(campaignAddress) ||
    manifest.data.campaignAddress.toLowerCase() !== campaignAddress.toLowerCase() ||
    manifest.data.milestoneIndex !== milestoneIndex
  ) {
    throw new ArtifactInvalidError("Swarm milestone manifest does not match the committed campaign or index");
  }
  return {
    ...manifest.data,
    campaignAddress: manifest.data.campaignAddress.toLowerCase(),
    evidenceFiles: manifest.data.evidenceFiles.map((ref) => `0x${ref.replace(/^0x/i, "").toLowerCase()}`),
  };
}
