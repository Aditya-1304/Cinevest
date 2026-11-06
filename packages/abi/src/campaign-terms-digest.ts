import { encodeAbiParameters, keccak256 } from "viem";
import { campaignAbi } from "./campaign";
import type { CampaignTerms } from "./config";

/**
 * Commits the Arc chain and complete immutable tuple using the compiler's own tuple layout.
 * Arkiv writers and backend validators must use these exact bytes; JSON key order and address
 * capitalization therefore cannot change a listing's economic commitment.
 */
export function campaignTermsDigest(chainId: number, terms: CampaignTerms) {
  const getter = campaignAbi.find((entry) => entry.type === "function" && entry.name === "getTerms");
  if (!getter || getter.type !== "function") throw new Error("Compiled terms tuple is missing");
  return keccak256(encodeAbiParameters([{ type: "uint256" }, ...getter.outputs], [BigInt(chainId), terms]));
}
