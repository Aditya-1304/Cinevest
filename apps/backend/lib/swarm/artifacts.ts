import "server-only";

import { requireServerEnv } from "../env";
import { checkBee } from "./bee";
import { normalizeSwarmReference } from "../arkiv/candidate-validation";
import {
  ArtifactInvalidError,
  ArtifactUnavailableError,
  buildGatewayUrl,
  decodeManifestJson,
  isManifestContentType,
  MAX_MANIFEST_BYTES,
  MAX_POSTER_BYTES,
  normalizeImageContentType,
  sniffImageContentType,
  parseMilestoneManifest,
  parsePitchManifest,
  readBounded,
  referenceMatches,
  SAFE_IMAGE_TYPES,
} from "./artifact-validation";

export { ArtifactInvalidError, ArtifactUnavailableError } from "./artifact-validation";

async function checkArtifactStorage() {
  let status: Awaited<ReturnType<typeof checkBee>>;
  try {
    status = await checkBee();
  } catch {
    throw new ArtifactUnavailableError("Bee postage status is temporarily unavailable");
  }
  if (!status.healthy || !status.batchUsable || status.ttlSeconds <= 0) {
    throw new ArtifactUnavailableError("Configured Bee postage batch is expired or unusable");
  }
  return status;
}

export async function fetchSwarmManifest(
  referenceInput: string,
  kind: "pitch" | "milestone",
  campaignAddress?: string,
  milestoneIndex?: number,
) {
  const reference = normalizeSwarmReference(referenceInput);
  if (!reference) throw new ArtifactInvalidError("Swarm reference must be 32 bytes");
  const storage = await checkArtifactStorage();
  let response: Response;
  try {
    response = await fetch(buildGatewayUrl(requireServerEnv("SWARM_GATEWAY_URL"), reference), {
      headers: { accept: "application/json, application/octet-stream" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new ArtifactUnavailableError("Configured Swarm gateway is temporarily unavailable");
  }
  if (!response.ok) throw new ArtifactUnavailableError(`Swarm gateway returned ${response.status}`);
  if (!isManifestContentType(response.headers.get("content-type"))) {
    throw new ArtifactInvalidError("Swarm manifest has an unsupported content type");
  }
  const bytes = await readBounded(response, MAX_MANIFEST_BYTES);
  if (!(await referenceMatches(bytes, reference))) {
    throw new ArtifactInvalidError("Swarm gateway bytes do not match the committed reference");
  }
  const value = decodeManifestJson(bytes);
  if (kind === "pitch") {
    return {
      reference,
      manifest: parsePitchManifest(value),
      storage: { ttlSeconds: storage.ttlSeconds },
    };
  }
  if (!campaignAddress || milestoneIndex === undefined) {
    throw new ArtifactInvalidError("Swarm milestone manifest does not match the committed campaign or index");
  }
  return {
    reference,
    manifest: parseMilestoneManifest(value, campaignAddress, milestoneIndex),
    storage: { ttlSeconds: storage.ttlSeconds },
  };
}

export async function fetchSwarmPoster(referenceInput: string) {
  const reference = normalizeSwarmReference(referenceInput);
  if (!reference) throw new ArtifactInvalidError("Swarm reference must be 32 bytes");
  const storage = await checkArtifactStorage();
  let response: Response;
  try {
    response = await fetch(buildGatewayUrl(requireServerEnv("SWARM_GATEWAY_URL"), reference), {
      headers: { accept: SAFE_IMAGE_TYPES.join(",") },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new ArtifactUnavailableError("Configured Swarm gateway is temporarily unavailable");
  }
  if (!response.ok) throw new ArtifactUnavailableError(`Swarm gateway returned ${response.status}`);
  const declaredType = normalizeImageContentType(response.headers.get("content-type"));
  const bytes = await readBounded(response, MAX_POSTER_BYTES);
  const contentType = declaredType ?? sniffImageContentType(bytes);
  if (!contentType) {
    throw new ArtifactInvalidError("Swarm poster has an unsupported image type");
  }
  if (!(await referenceMatches(bytes, reference))) {
    throw new ArtifactInvalidError("Swarm gateway bytes do not match the committed reference");
  }
  return {
    reference,
    contentType,
    bytes,
    ttlSeconds: storage.ttlSeconds,
  };
}

