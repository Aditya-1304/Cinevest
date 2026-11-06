/** Arc Testnet chain, factory deployment, test USDC and shared contract constants for the web app. */
import { defineChain, type Address, type ContractFunctionReturnType } from "viem";
import {
  arcTestnetDeployment,
  campaignAbi,
} from "@cinevest/abi";

export const ARC_TESTNET = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

export const ARC_TESTNET_DEPLOYMENT = {
  ...arcTestnetDeployment,
  factoryAddress: arcTestnetDeployment.address,
} as const;

// Arc Testnet ERC-20 USDC predeploy (spec section 3); 6 decimals, unlike native gas units.
export const ARC_TESTNET_USDC = {
  address: "0x3600000000000000000000000000000000000000" as Address,
  decimals: 6,
  symbol: "USDC",
} as const;

// CampaignTypes.sol Stage enum order.
export const CAMPAIGN_STAGES = [
  "Funding",
  "Refundable",
  "Production",
  "Released",
  "CancelledProduction",
] as const;

// Derived from getTerms so it can never drift from the deployed contract tuple.
export type CampaignTerms = ContractFunctionReturnType<
  typeof campaignAbi,
  "view",
  "getTerms"
>;
