import "server-only";
import { createWalletClient, http, zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET, campaignAbi, viewingReceiptData, type ViewingReceipt } from "@cinevest/abi";
import { verifiedArcClient } from "@/lib/arkiv/arc-client";
import { getServerEnv, requireServerEnv } from "@/lib/env";

const meterAccount = () => privateKeyToAccount(requireServerEnv("METER_PRIVATE_KEY") as Hex);

/** Arc's view of one viewer. A campaign not bound to this backend's key cannot be metered here. */
export async function readViewingChain(campaign: Address, wallet: Address) {
  const client = await verifiedArcClient();
  const call = { address: campaign, abi: campaignAbi } as const;
  const [signer, [balance, charged, sequence, exitAt], fullAccess] = await Promise.all([
    client.readContract({ ...call, functionName: "meterSigner" }),
    client.readContract({ ...call, functionName: "viewingAccounts", args: [wallet] }),
    client.readContract({ ...call, functionName: "hasPaidAccess", args: [wallet] }),
  ]);
  const configured = getServerEnv().METER_PRIVATE_KEY;
  return {
    metered: signer !== zeroAddress && !!configured && signer === meterAccount().address,
    balance, charged, sequence: Number(sequence), exitAt: exitAt === 0n ? null : new Date(Number(exitAt) * 1000), fullAccess,
  };
}
export type ViewingChain = Awaited<ReturnType<typeof readViewingChain>>;

export const signViewingReceipt = (receipt: ViewingReceipt) =>
  meterAccount().signTypedData(viewingReceiptData(ARC_TESTNET.id, receipt));

/** Relays a receipt with the meter key, which must hold Arc gas. Reverts surface in simulation. */
export async function submitViewingReceipt(receipt: ViewingReceipt, signature: Hex) {
  const client = await verifiedArcClient();
  const account = meterAccount();
  const { request } = await client.simulateContract({
    address: receipt.campaign, abi: campaignAbi, functionName: "settleViewing", args: [receipt, signature], account,
  });
  const wallet = createWalletClient({ account, chain: ARC_TESTNET, transport: http(getServerEnv().ARC_RPC_URL) });
  const hash = await wallet.writeContract(request);
  const outcome = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (outcome.status !== "success") throw new Error("Viewing settlement reverted");
  return hash;
}
