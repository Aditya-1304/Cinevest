import { isAddress } from "viem";
import type { CampaignTerms } from "@cinevest/abi";
import { campaignTermsDigest } from "@cinevest/abi/campaign-terms-digest";

export type FilmCandidate = {
  $key: string;
  $owner: string;
  $expiresAt?: bigint;
  arcChainId: { value: bigint };
  campaignAddress: { value: string };
  creatorAddress: { value: string };
  genre: { value: string };
  fundingDeadline: { value: bigint };
  title: { value: string };
  pitchSwarmRef: { value: string };
  posterSwarmRef: { value: string };
  termsDigest: { value: string };
  createdAt: { value: bigint };
  schemaVersion: { value: bigint };
};

export type CandidateCheck =
  | { valid: true; entity: FilmCandidate; campaign: `0x${string}`; creator: `0x${string}` }
  | { valid: false; reason: string };

export function normalizeSwarmReference(value: unknown): `0x${string}` | null {
  if (typeof value !== "string") return null;
  const hex = value.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return `0x${hex.toLowerCase()}`;
}

export function validateFilmCandidate(row: unknown, approvedChainId: number): CandidateCheck {
  if (!row || typeof row !== "object") return { valid: false, reason: "entity_malformed" };
  const entity = row as Partial<FilmCandidate>;
  const campaign = entity.campaignAddress?.value;
  const creator = entity.creatorAddress?.value;
  if (typeof entity.$key !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(entity.$key)) {
    return { valid: false, reason: "entity_key_invalid" };
  }
  if (typeof entity.$owner !== "string" || !isAddress(entity.$owner)) {
    return { valid: false, reason: "owner_invalid" };
  }
  if (typeof campaign !== "string" || !isAddress(campaign)) {
    return { valid: false, reason: "campaign_address_invalid" };
  }
  if (typeof creator !== "string" || !isAddress(creator)) {
    return { valid: false, reason: "creator_address_invalid" };
  }
  if (entity.arcChainId?.value !== BigInt(approvedChainId)) {
    return { valid: false, reason: "arc_chain_unapproved" };
  }
  if (entity.schemaVersion?.value !== 1n) {
    return { valid: false, reason: "schema_version_unsupported" };
  }
  if (entity.$owner.toLowerCase() !== creator.toLowerCase()) {
    return { valid: false, reason: "arkiv_owner_mismatch" };
  }
  if (
    typeof entity.title?.value !== "string" || entity.title.value.trim().length === 0 || new TextEncoder().encode(entity.title.value).byteLength > 128 ||
    typeof entity.genre?.value !== "string" || entity.genre.value.trim().length === 0 || new TextEncoder().encode(entity.genre.value).byteLength > 128 ||
    typeof entity.fundingDeadline?.value !== "bigint" ||
    !normalizeSwarmReference(entity.pitchSwarmRef?.value) ||
    !normalizeSwarmReference(entity.posterSwarmRef?.value) ||
    !/^(0x)?[0-9a-fA-F]{64}$/.test(entity.termsDigest?.value ?? "") ||
    typeof entity.createdAt?.value !== "bigint"
  ) {
    return { valid: false, reason: "mandatory_field_missing" };
  }
  return {
    valid: true,
    entity: entity as FilmCandidate,
    campaign: campaign.toLowerCase() as `0x${string}`,
    creator: creator.toLowerCase() as `0x${string}`,
  };
}

export function validateCandidate(row: unknown, chainId: number): row is FilmCandidate {
  return validateFilmCandidate(row, chainId).valid;
}

export function validateCampaignTerms(terms: CampaignTerms, expectedUsdc: string): string | null {
  if (
    terms.creator === "0x0000000000000000000000000000000000000000" ||
    terms.reviewer === "0x0000000000000000000000000000000000000000" ||
    terms.usdc.toLowerCase() !== expectedUsdc.toLowerCase() ||
    terms.reviewer.toLowerCase() === terms.creator.toLowerCase() ||
    terms.fundingGoal <= 0n || terms.watchPrice <= 0n || terms.fundingDeadline <= 0n ||
    terms.productionDeadline <= terms.fundingDeadline || terms.rightsDuration <= 0n ||
    terms.repaymentCapBps <= 0 || terms.funderBps > 10_000 ||
    !normalizeSwarmReference(terms.pitchReference) || /^0x0{64}$/i.test(terms.pitchReference)
  ) {
    return "campaign_terms_invalid";
  }
  return null;
}

export function verifyFilmCandidateTerms(
  entity: FilmCandidate,
  terms: CampaignTerms,
  chainId: number,
  expectedUsdc: string,
): string | null {
  const invalidTerms = validateCampaignTerms(terms, expectedUsdc);
  if (invalidTerms) return invalidTerms;
  if (terms.creator.toLowerCase() !== entity.creatorAddress.value.toLowerCase()) {
    return "arc_creator_mismatch";
  }
  if (terms.fundingDeadline !== entity.fundingDeadline.value) {
    return "funding_deadline_mismatch";
  }
  if (normalizeSwarmReference(terms.pitchReference) !== normalizeSwarmReference(entity.pitchSwarmRef.value)) {
    return "pitch_reference_mismatch";
  }
  const storedDigest = entity.termsDigest.value.replace(/^0x/i, "").toLowerCase();
  if (
    campaignTermsDigest(chainId, terms).slice(2).toLowerCase() !== storedDigest
  ) {
    return "terms_digest_mismatch";
  }
  return null;
}

export function verifyRegisteredFilmCandidate(
  entity: FilmCandidate,
  registered: boolean,
  terms: CampaignTerms | undefined,
  chainId: number,
  expectedUsdc: string,
): string | null {
  if (!registered) return "factory_unregistered";
  if (!terms) return "campaign_terms_invalid";
  return verifyFilmCandidateTerms(entity, terms, chainId, expectedUsdc);
}
