import "server-only";
import { campaignAbi, campaignFactoryAbi, ARC_TESTNET_DEPLOYMENT } from "@cinevest/abi";
import { type Address, type Hex, zeroHash } from "viem";
import { verifiedArcClient } from "@/lib/arkiv/arc-client";
import { WorldError } from "./error";

/** Pin authorization policy reads to one canonical Arc block and the registered campaign revision. */
export async function readWorldFundingState(campaign: Address, nullifier: Hex, digest: Hex = zeroHash) {
  const client = await verifiedArcClient();
  const block = await client.getBlock();
  const registered = await client.readContract({ address: ARC_TESTNET_DEPLOYMENT.factoryAddress,
    abi: campaignFactoryAbi, functionName: "isCampaign", args: [campaign], blockNumber: block.number });
  if (!registered) throw new WorldError("Campaign is not registered", 404);
  const call = { address: campaign, abi: campaignAbi, blockNumber: block.number } as const;
  const [terms, signer, stage, raised, funded, owner, used] = await Promise.all([
    client.readContract({ ...call, functionName: "getTerms" }),
    client.readContract({ ...call, functionName: "worldVerifierSigner" }),
    client.readContract({ ...call, functionName: "getStage" }),
    client.readContract({ ...call, functionName: "raised" }),
    client.readContract({ ...call, functionName: "humanContribution", args: [nullifier] }),
    client.readContract({ ...call, functionName: "nullifierOwner", args: [nullifier] }),
    client.readContract({ ...call, functionName: "usedWorldAuthorizations", args: [digest] }),
  ]);
  return { terms, signer, owner, funded, used,
    open: stage === 0 && raised < terms.fundingGoal && block.timestamp < terms.fundingDeadline };
}
