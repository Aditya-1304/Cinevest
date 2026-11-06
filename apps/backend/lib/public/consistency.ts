import { createPublicClient as createArkivClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { key } from "@arkiv-network/sdk/schema";
import { createPublicClient, http, isAddress, zeroHash } from "viem";
import { ARC_TESTNET, ARC_TESTNET_DEPLOYMENT, ARC_TESTNET_USDC, campaignAbi, campaignFactoryAbi } from "@cinevest/abi";
import { filmSchema } from "../arkiv/film-schema";
import { validateFilmCandidate, verifyFilmCandidateTerms } from "../arkiv/candidate-validation";
import { buildGatewayUrl, decodeManifestJson, isManifestContentType, MAX_MANIFEST_BYTES,
  parseMilestoneManifest, parsePitchManifest, readBounded, referenceMatches } from "../swarm/artifact-validation";

export type PublicSources = { arcRpc?: string; arkivRpc?: string; gateway: string; factory?: `0x${string}` };
type ArtifactCheck = { status: "verified" | "unavailable" | "invalid" | "absent"; reference: string };
type Pitch = ReturnType<typeof parsePitchManifest>;
type Milestone = ReturnType<typeof parseMilestoneManifest>;

/** Public tools accept endpoint origins, never authenticated URLs or private media identifiers. */
function publicEndpoint(value: string | undefined) {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("Public endpoints require HTTPS without credentials, query parameters or fragments");
  return url.href;
}

async function manifest(reference: string, gateway: string): Promise<{ check: ArtifactCheck; value?: unknown }> {
  if (reference === zeroHash) return { check: { status: "absent", reference } };
  let response: Response;
  try {
    response = await fetch(buildGatewayUrl(gateway, reference), {
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { accept: "application/json, application/octet-stream" },
    });
    if (!response.ok) return { check: { status: "unavailable", reference } };
  } catch { return { check: { status: "unavailable", reference } }; }
  try {
    if (!isManifestContentType(response.headers.get("content-type"))) throw new Error("Invalid content type");
    const bytes = await readBounded(response, MAX_MANIFEST_BYTES);
    if (!await referenceMatches(bytes, reference)) throw new Error("Invalid content address");
    return { check: { status: "verified", reference }, value: decodeManifestJson(bytes) };
  } catch { return { check: { status: "invalid", reference } }; }
}

/** Browser/CLI verification shares public data only; the returned report deliberately excludes media URLs and IDs. */
export async function inspectPublicFilm(entityId: string, sources: PublicSources) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(entityId)) throw new Error("Arkiv entity key must be 32 bytes");
  const gateway = publicEndpoint(sources.gateway)!;
  const arc = createPublicClient({ chain: ARC_TESTNET, transport: http(publicEndpoint(sources.arcRpc), { timeout: 10000, retryCount: 0 }) });
  const arkiv = createArkivClient({ chain: rabdi({ accessKey: "" }), transport: http(publicEndpoint(sources.arkivRpc), { timeout: 10000, retryCount: 0 }) });
  if (await arc.getChainId() !== ARC_TESTNET.id) throw new Error("Arc Testnet is required");
  const factory = sources.factory ?? ARC_TESTNET_DEPLOYMENT.factoryAddress;
  if (!isAddress(factory)) throw new Error("Invalid campaign factory");
  const [block, arkivBlock, page] = await Promise.all([
    arc.getBlock(), arkiv.getBlockNumber(),
    arkiv.select({ $key: true, $owner: true, $expiresAt: true, arcChainId: true, campaignAddress: true,
      creatorAddress: true, genre: true, fundingDeadline: true, title: true, pitchSwarmRef: true,
      posterSwarmRef: true, termsDigest: true, createdAt: true, schemaVersion: true })
      .from(filmSchema, { onMismatch: "throw" }).where(eq("$key", key(entityId as `0x${string}`))).limit(1).fetch(),
  ]);
  const candidate = validateFilmCandidate(page.entities[0], ARC_TESTNET.id);
  if (!candidate.valid) throw new Error("Listing validation failed");
  const entity = candidate.entity;
  if (typeof entity.$expiresAt !== "bigint" || entity.$expiresAt <= arkivBlock) throw new Error("Listing has expired");
  const campaign = candidate.campaign;
  if (!await arc.readContract({ address: factory, abi: campaignFactoryAbi, functionName: "isCampaign", args: [campaign], blockNumber: block.number }))
    throw new Error("Campaign is not in the selected factory registry");
  const read = <T extends "getTerms" | "getStage" | "livepeerPlaybackIdHash">(functionName: T) =>
    arc.readContract({ address: campaign, abi: campaignAbi, functionName, blockNumber: block.number });
  const [terms, stage, playbackCommitment, ...references] = await Promise.all([
    read("getTerms"), read("getStage"), read("livepeerPlaybackIdHash"),
    ...[1n, 2n].map(index => arc.readContract({ address: campaign, abi: campaignAbi, functionName: "evidenceReference", args: [index], blockNumber: block.number })),
  ]);
  const mismatch = verifyFilmCandidateTerms(entity, terms, ARC_TESTNET.id, ARC_TESTNET_USDC.address);
  if (mismatch) throw new Error("Listing does not match immutable Arc terms");
  const pitchResult = await manifest(terms.pitchReference, gateway);
  let pitch: Pitch | null = null;
  if (pitchResult.check.status === "verified") {
    try {
      pitch = parsePitchManifest(pitchResult.value);
      if (pitch.creator !== terms.creator.toLowerCase() || pitch.title !== entity.title.value
        || pitch.genre !== entity.genre.value || pitch.posterRef !== entity.posterSwarmRef.value.replace(/^0x/i, "").toLowerCase())
        throw new Error("Pitch metadata mismatch");
    } catch { pitch = null; pitchResult.check.status = "invalid"; }
  }
  const milestones: { index: number; check: ArtifactCheck; manifest: Milestone | null }[] = [];
  for (const [index, reference] of references.entries()) {
    const result = await manifest(reference, gateway);
    let parsed: Milestone | null = null;
    if (result.check.status === "verified") {
      try { parsed = parseMilestoneManifest(result.value, campaign, index + 1); }
      catch { result.check.status = "invalid"; }
    }
    milestones.push({ index: index + 1, check: result.check, manifest: parsed });
  }
  const report = {
    schema: "Cinevest.public-consistency.v1", entityId, campaign, factory,
    observedAt: new Date().toISOString(),
    arc: { chainId: ARC_TESTNET.id, blockNumber: block.number.toString(), blockHash: block.hash, stage, registry: "verified", immutableTerms: "verified" },
    arkiv: { observedBlock: arkivBlock.toString(), owner: entity.$owner, expiresAt: entity.$expiresAt.toString(), snapshot: "query observed near block; not an atomic cross-chain snapshot" },
    swarm: { pitch: pitchResult.check, milestones: milestones.map(({ index, check }) => ({ index, ...check })) },
    media: { commitment: playbackCommitment, configured: playbackCommitment !== zeroHash,
      providerAvailability: "not_independently_verifiable", signedOnlyPolicy: "not_independently_verifiable",
      explanation: "Arc exposes a hash, not a provider identifier. Provider readiness and access policy require separate authenticated acceptance evidence." },
    consistent: pitchResult.check.status === "verified"
      && milestones.every(item => ["verified", "absent"].includes(item.check.status))
      && (stage !== 3 || (playbackCommitment !== zeroHash && milestones[1].check.status === "verified")),
  };
  return { report, pitch, milestones };
}
