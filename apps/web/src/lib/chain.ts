/** Web-specific constants layered on the shared @cinevest/abi package exports. */
export {
  ARC_TESTNET,
  ARC_TESTNET_DEPLOYMENT,
  ARC_TESTNET_USDC,
  type CampaignTerms,
} from "@cinevest/abi";

// CampaignTypes.sol Stage enum order.
export const CAMPAIGN_STAGES = [
  "Funding",
  "Refundable",
  "Production",
  "Released",
  "CancelledProduction",
] as const;
