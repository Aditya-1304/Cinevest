import { type Address, type Hex, hashTypedData } from "viem";

/** Shared encoding contract for the future P9.6 verifier and P9.8 issuer; this module does not sign permissions. */
export const worldAuthorizationTypes = {
  WorldAuthorization: [
    { name: "wallet", type: "address" },
    { name: "campaign", type: "address" },
    { name: "scopedNullifierHash", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type WorldAuthorization = {
  wallet: Address; campaign: Address; scopedNullifierHash: Hex; nonce: Hex; deadline: bigint;
};

export function worldAuthorizationData(chainId: number, message: WorldAuthorization) {
  return {
    domain: { name: "CinevestWorldAuthorization", version: "1", chainId, verifyingContract: message.campaign },
    primaryType: "WorldAuthorization" as const,
    types: worldAuthorizationTypes,
    message,
  };
}

export function worldAuthorizationDigest(chainId: number, message: WorldAuthorization) {
  return hashTypedData(worldAuthorizationData(chainId, message));
}
