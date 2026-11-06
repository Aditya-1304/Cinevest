import "server-only";
import { type Address } from "viem";
import { thresholdReviewerAbi, ARC_TESTNET_DEPLOYMENT, campaignAbi, campaignFactoryAbi } from "@cinevest/abi";
import { verifiedArcClient } from "@/lib/arkiv/arc-client";

const RELEASED = 3;
const CANCELLED_PRODUCTION = 4;

/** Reads the Arc facts media routes depend on; Arc, not the database, decides creator identity and release lock. */
export async function readCampaignMedia(campaign: `0x${string}`, wallet?: `0x${string}`) {
  const client = await verifiedArcClient();
  const isCampaign = await client.readContract({
    address: ARC_TESTNET_DEPLOYMENT.factoryAddress, abi: campaignFactoryAbi, functionName: "isCampaign", args: [campaign],
  });
  if (!isCampaign) return null;
  const call = { address: campaign, abi: campaignAbi } as const;
  const [terms, stage, raised, approved, onchainHash, paid] = await Promise.all([
    client.readContract({ ...call, functionName: "getTerms" }),
    client.readContract({ ...call, functionName: "getStage" }),
    client.readContract({ ...call, functionName: "raised" }),
    client.readContract({ ...call, functionName: "approvedTrancheAmount" }),
    client.readContract({ ...call, functionName: "livepeerPlaybackIdHash" }),
    wallet ? client.readContract({ ...call, functionName: "hasPaidAccess", args: [wallet] }) : false,
  ]);
  return {
    creator: terms.creator.toLowerCase(),
    reviewer: terms.reviewer.toLowerCase(),
    released: stage === RELEASED,
    paid,
    watchPrice: terms.watchPrice,
    onchainHash: onchainHash.toLowerCase(),
    // Contract rejects configureRelease once final evidence is approved, so the offchain selection locks at the same point.
    locked: stage === RELEASED || stage === CANCELLED_PRODUCTION || (raised > 0n && approved >= raised),
  };
}


/** Committee signers may inspect redacted readiness evidence; approval still requires threshold signatures. */
export async function canInspectRelease(wallet: string, creator: string, reviewer: string) {
  if (wallet === creator || wallet === reviewer) return true;
  try {
    const client = await verifiedArcClient();
    return await client.readContract({ address: reviewer as Address, abi: thresholdReviewerAbi,
      functionName: "isSigner", args: [wallet as Address] });
  } catch { return false; }
}
