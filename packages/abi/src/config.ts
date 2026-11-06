import { arcTestnet } from "viem/chains";
import type { ContractFunctionReturnType } from "viem";
import { campaignAbi } from "./campaign";
import { arcTestnetDeployment } from "./deployment";

/** Testnet-only network configuration shared by server readers and wallet clients. */
export const ARC_TESTNET = arcTestnet;
export const ARC_TESTNET_USDC = {
  address: "0x3600000000000000000000000000000000000000",
  decimals: 6,
} as const;
/** The confirmed factory registry is the authority for whether a campaign belongs to this app. */
export const ARC_TESTNET_DEPLOYMENT = {
  ...arcTestnetDeployment,
  factoryAddress: arcTestnetDeployment.address,
} as const;
export type CampaignTerms = ContractFunctionReturnType<typeof campaignAbi, "view", "getTerms">;
