import "server-only";
import { createPublicClient, http, keccak256 } from "viem";
import { ARC_TESTNET, ARC_TESTNET_DEPLOYMENT } from "@cinevest/abi";
import { getServerEnv } from "../env";

/** Reject misconfigured settlement RPCs before treating any returned registry or balance as Arc state. */
export async function verifiedArcClient(timeout = 5000) {
  if (!ARC_TESTNET_DEPLOYMENT.compatible) throw new Error("Factory redeployment is required for the current contract revision");
  // The public Arc RPC rejects bursts ("Request exceeds defined limit") and refuses JSON-RPC
  // batches, so retry rate-limit errors with backoff instead of failing discovery.
  const client = createPublicClient({ chain: ARC_TESTNET, transport: http(getServerEnv().ARC_RPC_URL, { timeout, retryCount: 4, retryDelay: 300 }) });
  if (await client.getChainId() !== ARC_TESTNET.id) throw new Error("Settlement RPC must use Arc Testnet");
  const code = await client.getCode({ address: ARC_TESTNET_DEPLOYMENT.factoryAddress });
  if (!code || keccak256(code) !== ARC_TESTNET_DEPLOYMENT.runtimeCodeHash) throw new Error("Factory runtime does not match the verified deployment manifest");
  return client;
}
