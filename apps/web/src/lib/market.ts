/**
 * Read-only client for the backend discovery API (same-origin /api proxy). Listings come from
 * Arkiv and are verified against Arc by the backend; amounts here are for display only and any
 * payment authorization must re-read Arc.
 */
import type { Address } from "viem";
import { ARC_TESTNET } from "@/lib/chain";
import type { WireTerms } from "@/lib/publication-client";

export type MarketFilm = {
  key: string;
  entityId: string;
  campaignAddress: Address;
  creatorAddress: Address;
  owner: string;
  genre: string;
  title: string;
  fundingDeadline: string;
  pitchSwarmRef: string;
  posterSwarmRef: string;
  expiresAtBlock: string | null;
  stage: number | null;
  raised: string | null;
  stale: boolean;
};

export type MarketPage = {
  films: MarketFilm[];
  nextCursor: string | null;
  status: "complete" | "partial" | "unavailable";
  retryable: boolean;
  completeness: "exact" | "best-effort";
  excluded: number;
  temporarilyUnverifiable: number;
};

export async function fetchMarket(options: {
  genre?: string;
  cursor?: string | null;
  owner?: string;
}): Promise<MarketPage> {
  const params = new URLSearchParams();
  if (options.genre) params.set("genre", options.genre);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.owner) params.set("owner", options.owner);
  const response = await fetch(`/api/market?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Discovery is unavailable. Try again.");
  return (await response.json()) as MarketPage;
}

export type FilmDetail = {
  campaignAddress: Address;
  terms: WireTerms;
  stage: number;
  raised: string;
  evidenceReferences: string[];
  listingStatus: "listed" | "unlisted" | "unavailable";
  listing: {
    entityId: string;
    owner: string;
    title: string;
    genre: string;
    pitchSwarmRef: string | null;
    posterSwarmRef: string | null;
    expiresAtBlock: string | null;
    remainingBlocks: string;
  } | null;
};

export async function fetchFilmDetail(campaign: string): Promise<FilmDetail> {
  const response = await fetch(`/api/film/${ARC_TESTNET.id}/${campaign}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Campaign details are unavailable.");
  return (await response.json()) as FilmDetail;
}

export type PitchManifest = {
  title: string;
  synopsis: string;
  genre: string;
  creator: string;
  rightsNotice: string;
  posterRef: string;
};

/** The backend verifies these bytes against the Arc pitch commitment before returning them. */
export async function fetchPitch(reference: string, campaign: string): Promise<PitchManifest> {
  const response = await fetch(`/api/swarm/${reference}?kind=pitch&campaign=${campaign}`, { cache: "no-store" });
  if (!response.ok) throw new Error("The pitch could not be verified from Swarm.");
  const data = (await response.json()) as { manifest: PitchManifest };
  return data.manifest;
}

export const posterUrl = (reference: string) => `/api/swarm/${reference}?kind=poster`;
