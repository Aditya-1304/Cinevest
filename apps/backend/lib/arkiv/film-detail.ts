import "server-only";

import { createPublicClient as createArkivClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { asc, eq } from "@arkiv-network/sdk/query";
import { addr } from "@arkiv-network/sdk/schema";
import { http, type Address } from "viem";
import { verifiedArcClient } from "./arc-client";
import {
  ARC_TESTNET,
  ARC_TESTNET_DEPLOYMENT,
  ARC_TESTNET_USDC,
  campaignAbi,
  campaignFactoryAbi,
} from "@cinevest/abi";
import { getServerEnv } from "../env";
import { readCampaignSnapshots } from "./arc-snapshot";
import { filmSchema } from "./film-schema";
import {
  normalizeSwarmReference,
  validateFilmCandidate,
  validateCampaignTerms,
  verifyFilmCandidateTerms,
} from "./candidate-validation";

export async function queryFilmDetail(arcChainId: number, campaignAddress: Address) {
  if (arcChainId !== ARC_TESTNET.id) throw new Error("Unsupported Arc chain");
  const factory = ARC_TESTNET_DEPLOYMENT.factoryAddress;
  if (!factory) throw new Error("Arc campaign factory is not configured");
  if (!ARC_TESTNET_DEPLOYMENT.compatible) throw new Error("Factory redeployment is required for the current contract revision");
  const arc = await verifiedArcClient();
  const { blockNumber, snapshots } = await readCampaignSnapshots(
    [campaignAddress],
    () => arc.getBlockNumber(),
    async (campaign, pinnedBlock) => {
      try {
        const registered = await arc.readContract({
          address: factory,
          abi: campaignFactoryAbi,
          functionName: "isCampaign",
          args: [campaign],
          blockNumber: pinnedBlock,
        });
        if (!registered) return { state: "unregistered" as const };
        const [terms, stage, raised, roughCut, finalDelivery] = await Promise.all([
          arc.readContract({ address: campaign, abi: campaignAbi, functionName: "getTerms", blockNumber: pinnedBlock }),
          arc.readContract({ address: campaign, abi: campaignAbi, functionName: "getStage", blockNumber: pinnedBlock }),
          arc.readContract({ address: campaign, abi: campaignAbi, functionName: "raised", blockNumber: pinnedBlock }),
          arc.readContract({ address: campaign, abi: campaignAbi, functionName: "evidenceReference", args: [1n], blockNumber: pinnedBlock }),
          arc.readContract({ address: campaign, abi: campaignAbi, functionName: "evidenceReference", args: [2n], blockNumber: pinnedBlock }),
        ]);
        return { state: "verified" as const, terms, stage, raised, evidenceReferences: [roughCut, finalDelivery] as const };
      } catch {
        return { state: "unavailable" as const };
      }
    },
    1,
  );
  const campaign = snapshots[0];
  if (!campaign || campaign.state === "unavailable") throw new Error("Arc campaign reads are unavailable");
  if (campaign.state === "unregistered") throw new Error("Campaign is not registered with the configured factory");
  if (validateCampaignTerms(campaign.terms, ARC_TESTNET_USDC.address)) throw new Error("Campaign returned invalid immutable terms");

  let listing: Record<string, unknown> | null = null;
  let listingStatus: "listed" | "unlisted" | "unavailable" = "unlisted";
  try {
    const arkiv = createArkivClient({
      chain: rabdi({ accessKey: getServerEnv().ARKIV_ACCESS_KEY ?? "" }),
      transport: http(getServerEnv().ARKIV_RPC_URL, { timeout: 5_000, retryCount: 0 }),
    });
    const page = await arkiv
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
      .from(filmSchema, { onMismatch: "throw" })
      .ownedBy(campaign.terms.creator)
      .where(eq("campaignAddress", addr(campaignAddress)))
      .orderBy(asc("$key"))
      .limit(100)
      .fetch();
    const currentBlock = await arkiv.getBlockNumber();
    const candidate = page.entities.find((entity) => {
      const check = validateFilmCandidate(entity, ARC_TESTNET.id);
      return (
        check.valid &&
        typeof entity.$expiresAt === "bigint" &&
        entity.$expiresAt > currentBlock &&
        verifyFilmCandidateTerms(check.entity, campaign.terms, ARC_TESTNET.id, ARC_TESTNET_USDC.address) === null
      );
    });
    if (candidate) {
      listingStatus = "listed";
      listing = {
        entityId: candidate.$key,
        owner: candidate.$owner,
        creatorAddress: candidate.creatorAddress.value,
        title: candidate.title.value,
        genre: candidate.genre.value,
        pitchSwarmRef: normalizeSwarmReference(candidate.pitchSwarmRef.value),
        posterSwarmRef: normalizeSwarmReference(candidate.posterSwarmRef.value),
        expiresAtBlock: candidate.$expiresAt?.toString() ?? null,
        remainingBlocks: candidate.$expiresAt ? (candidate.$expiresAt - currentBlock).toString() : "0",
      };
    }
  } catch {
    listingStatus = "unavailable";
  }

  return {
    arcChainId,
    campaignAddress,
    sourceBlock: blockNumber.toString(),
    terms: Object.fromEntries(
      Object.entries(campaign.terms).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value]),
    ),
    stage: campaign.stage,
    raised: campaign.raised.toString(),
    evidenceReferences: campaign.evidenceReferences.map((reference) => reference.toLowerCase()),
    listingStatus,
    listing,
  };
}
