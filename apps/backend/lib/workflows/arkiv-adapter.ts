import "server-only";

import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import { getServerEnv } from "../env";

export type ArkivReceiptStatus = "pending" | "confirmed" | "failed";

/** Checks a journalled Arkiv transaction before deciding whether its entity write can be retried. */
export async function getArkivReceiptStatus(hash: string): Promise<ArkivReceiptStatus> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Invalid Arkiv transaction hash");
  const chain = rabdi({ accessKey: getServerEnv().ARKIV_ACCESS_KEY ?? "" });
  const client = createPublicClient({
    chain,
    transport: http(getServerEnv().ARKIV_RPC_URL, { timeout: 5_000, retryCount: 0 }),
  });
  try {
    const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
    return receipt.status === "success" ? "confirmed" : "failed";
  } catch (error) {
    if (error instanceof Error && /receipt.*(?:not found|could not be found)/i.test(error.message)) {
      return "pending";
    }
    throw error;
  }
}
