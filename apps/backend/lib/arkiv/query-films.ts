import "server-only";

import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, asc, eq, gt, lte } from "@arkiv-network/sdk/query";
import { key, str, u64 } from "@arkiv-network/sdk/schema";
import { createPublicClient as createArcClient, http } from "viem";
import {
  ARC_TESTNET,
  ARC_TESTNET_DEPLOYMENT,
  ARC_TESTNET_USDC,
  campaignAbi,
  campaignFactoryAbi,
  type CampaignTerms,
} from "@reelance/abi";
import { getServerEnv } from "../env";
import { readCampaignSnapshots } from "./arc-snapshot";
import { discoverFilms, MAX_CANDIDATES, MAX_PAGES, type LoadedPage, type LoadPageRequest } from "./discovery";
import {
  validateFilmCandidate,
  verifyRegisteredFilmCandidate,
  type FilmCandidate,
} from "./candidate-validation";
import { filmSchema } from "./film-schema";

type VerifiedFilm = {
  entity: FilmCandidate;
  stage: number | null;
  raised: bigint | null;
  sourceBlock: string;
  stale: boolean;
};

type CachedMetadata = { entity: FilmCandidate; sourceBlock: string; expiresAt: number };
type ArcReadResult =
  | { state: "unavailable" }
  | { state: "ok"; registered: false }
  | { state: "ok"; registered: true; terms: CampaignTerms; stage: number; raised: bigint };
const VERIFIED_METADATA_TTL_MS = 60_000;
const MAX_VERIFIED_METADATA = 5_000;
const verifiedMetadata = new Map<string, CachedMetadata>();

function remember(entity: FilmCandidate, sourceBlock: bigint) {
  const source = sourceBlock.toString();
  verifiedMetadata.set(entity.campaignAddress.value.toLowerCase(), {
    entity,
    sourceBlock: source,
    expiresAt: Date.now() + VERIFIED_METADATA_TTL_MS,
  });
  if (verifiedMetadata.size > MAX_VERIFIED_METADATA) {
    const oldest = verifiedMetadata.keys().next().value;
    if (oldest) verifiedMetadata.delete(oldest);
  }
  return { entity, sourceBlock: source, stale: false };
}

function staleMetadata(campaign: string): VerifiedFilm | null {
  const cached = verifiedMetadata.get(campaign.toLowerCase());
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    verifiedMetadata.delete(campaign.toLowerCase());
    return null;
  }
  return { entity: cached.entity, sourceBlock: cached.sourceBlock, stage: null, raised: null, stale: true };
}

export async function queryFilms({
  genre,
  deadline,
  cursor,
  owner,
  limit = 20,
}: {
  genre?: string;
  deadline?: bigint;
  cursor?: string;
  owner?: `0x${string}`;
  limit?: number;
}) {
  const factory = ARC_TESTNET_DEPLOYMENT.factoryAddress;
  if (!factory) throw new Error("Arc campaign factory is not configured");
  const chain = rabdi({ accessKey: getServerEnv().ARKIV_ACCESS_KEY ?? "" });
  const arkiv = createPublicClient({
    chain,
    transport: http(undefined, { timeout: 5_000, retryCount: 0 }),
  });
  const arc = createArcClient({
    chain: ARC_TESTNET,
    transport: http(undefined, { timeout: 5_000, retryCount: 0 }),
  });
  const excludedReasons: Record<string, number> = {};
  let temporarilyUnverifiable = 0;
  const reject = (reason: string) => {
    excludedReasons[reason] = (excludedReasons[reason] ?? 0) + 1;
  };

  const result = await discoverFilms<VerifiedFilm>({
    filters: { genre, deadline, owner },
    cursor,
    limit,
    targetItems: limit,
    maxPages: MAX_PAGES,
    maxCandidates: MAX_CANDIDATES,
    loadPage: async (request: LoadPageRequest): Promise<LoadedPage> => {
      const query = arkiv
        .select({
          $key: true,
          $owner: true,
          $expiresAt: true,
          arcChainId: true,
          campaignAddress: true,
          creatorAddress: true,
          genre: true,
          fundingDeadline: true,
          title: true,
          pitchSwarmRef: true,
          posterSwarmRef: true,
          termsDigest: true,
          createdAt: true,
          schemaVersion: true,
        })
        .from(filmSchema, { onMismatch: request.onMismatch })
        .orderBy(asc("$key"))
        .limit(request.limit);
      if (request.filters.owner) query.ownedBy(request.filters.owner);
      const filters = [];
      if (request.filters.genre) filters.push(eq("genre", str(request.filters.genre)));
      if (request.filters.deadline !== undefined) {
        filters.push(lte("fundingDeadline", u64(request.filters.deadline)));
      }
      if (request.afterKey) filters.push(gt("$key", key(request.afterKey)));
      if (filters.length) query.where(and(...filters));
      if (request.offset > 0) query.offset(request.offset);
      const page = await query.fetch();
      return {
        rows: page.entities,
        skipped: page.skipped,
        exhausted: page.entities.length + page.skipped < request.limit,
      };
    },
    keyOf: (row) => (row as Partial<FilmCandidate>)?.$key,
    identityOf: (film) => film.entity.campaignAddress.value,
    verify: async () => null,
    verifyBatch: async (rows) => {
      const checks = rows.map((row) => validateFilmCandidate(row, ARC_TESTNET.id));
      const indexesByCampaign = new Map<string, number>();
      const candidates: { index: number; campaign: `0x${string}`; entity: FilmCandidate }[] = [];
      const output: (VerifiedFilm | null)[] = rows.map(() => null);
      checks.forEach((check, index) => {
        if (!check.valid) {
          reject(check.reason);
          return;
        }
        if (indexesByCampaign.has(check.campaign)) {
          reject("duplicate_campaign");
          return;
        }
        indexesByCampaign.set(check.campaign, index);
        candidates.push({ index, campaign: check.campaign, entity: check.entity });
      });
      if (!candidates.length) return output;

      let snapshots: { blockNumber: bigint; snapshots: ArcReadResult[] };
      try {
        snapshots = await readCampaignSnapshots(
          candidates.map(({ campaign }) => campaign),
          () => arc.getBlockNumber(),
          async (campaign, blockNumber) => {
            try {
              const registered = await arc.readContract({
                address: factory,
                abi: campaignFactoryAbi,
                functionName: "isCampaign",
                args: [campaign],
                blockNumber,
              });
              if (!registered) {
                return { state: "ok" as const, registered: false as const };
              }
              const [terms, stage, raised] = await Promise.all([
                arc.readContract({ address: campaign, abi: campaignAbi, functionName: "getTerms", blockNumber }),
                arc.readContract({ address: campaign, abi: campaignAbi, functionName: "getStage", blockNumber }),
                arc.readContract({ address: campaign, abi: campaignAbi, functionName: "raised", blockNumber }),
              ]);
              return { state: "ok" as const, registered: true as const, terms, stage, raised };
            } catch {
              return { state: "unavailable" as const };
            }
          },
        );
      } catch {
        for (const { index, campaign } of candidates) {
          const cached = staleMetadata(campaign);
          if (cached) output[index] = cached;
          else temporarilyUnverifiable += 1;
        }
        return output;
      }

      snapshots.snapshots.forEach((snapshot, position) => {
        const candidate = candidates[position];
        if (!candidate) return;
        if (!snapshot || typeof snapshot !== "object" || !("state" in snapshot) || snapshot.state === "unavailable") {
          output[candidate.index] = staleMetadata(candidate.campaign);
          if (!output[candidate.index]) temporarilyUnverifiable += 1;
          return;
        }
        if (snapshot.state !== "ok") {
          reject("factory_unregistered");
          return;
        }
        const invalid = verifyRegisteredFilmCandidate(
          candidate.entity,
          snapshot.registered,
          snapshot.registered ? snapshot.terms : undefined,
          ARC_TESTNET.id,
          ARC_TESTNET_USDC.address,
        );
        if (invalid) {
          reject(invalid);
          return;
        }
        if (!snapshot.registered) return;
        const metadata = remember(candidate.entity, snapshots.blockNumber);
        output[candidate.index] = {
          ...metadata,
          stage: snapshot.stage,
          raised: snapshot.raised,
        };
      });
      return output;
    },
  });

  const stale = result.items.some((item) => item.stale);
  return {
    entities: result.items,
    status: temporarilyUnverifiable > 0 && result.status === "complete" ? "partial" as const : result.status,
    retryable: result.retryable || temporarilyUnverifiable > 0,
    completeness: result.completeness,
    nextCursor: result.nextCursor,
    excluded: Math.max(0, result.excluded - temporarilyUnverifiable),
    temporarilyUnverifiable,
    scanned: result.scanned,
    pages: result.pages,
    excludedReasons,
    verificationStatus: stale ? "stale" as const : temporarilyUnverifiable > 0 ? "unverifiable" as const : "verified" as const,
  };
}
