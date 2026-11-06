import { type Address, type Hex } from "viem";

/** EIP-712 encoding shared by the backend meter and the campaign's receipt verifier. */
const viewingReceiptTypes = {
  ViewingReceipt: [
    { name: "viewer", type: "address" },
    { name: "campaign", type: "address" },
    { name: "filmHash", type: "bytes32" },
    { name: "sessionId", type: "bytes32" },
    { name: "sequence", type: "uint64" },
    { name: "cumulativeCharge", type: "uint256" },
    { name: "spendCap", type: "uint256" },
    { name: "finalForWithdrawal", type: "bool" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type ViewingReceipt = {
  viewer: Address; campaign: Address; filmHash: Hex; sessionId: Hex; sequence: bigint;
  cumulativeCharge: bigint; spendCap: bigint; finalForWithdrawal: boolean; deadline: bigint;
};

/** The campaign reuses its single EIP-712 domain, whose name predates metering. */
export function viewingReceiptData(chainId: number, message: ViewingReceipt) {
  return {
    domain: { name: "CinevestWorldAuthorization", version: "1", chainId, verifyingContract: message.campaign },
    primaryType: "ViewingReceipt" as const,
    types: viewingReceiptTypes,
    message,
  };
}

/** JSON transport format; browsers convert the numeric strings back before simulation. */
export type ViewingReceiptGrant = {
  receipt: Omit<ViewingReceipt, "sequence" | "cumulativeCharge" | "spendCap" | "deadline"> & {
    sequence: string; cumulativeCharge: string; spendCap: string; deadline: string;
  };
  signature: Hex;
};
