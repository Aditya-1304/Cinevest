import "server-only";
import { randomUUID } from "node:crypto";
import { encodeFunctionData, type Address } from "viem";
import { ARC_TESTNET_DEPLOYMENT, campaignAbi } from "@cinevest/abi";
import { requireServerEnv } from "../env";
import { verifiedArcClient } from "../arkiv/arc-client";
import { readBounded } from "../swarm/artifact-validation";
import { reviewReportSchema, type ReviewReport } from "../../../../cre/protocol";

/** The authenticated runner is trusted simulation infrastructure, never a production oracle. */
export async function checkCreRelease(campaign: Address, assetId: string, playbackCommitment: string): Promise<ReviewReport> {
  const url = new URL(requireServerEnv("CRE_RUNNER_URL"));
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))))
    throw new Error("CRE runner requires HTTPS or loopback HTTP");
  const client = await verifiedArcClient();
  const block = await client.getBlock();
  const evidenceHash = await client.readContract({
    address: campaign, abi: campaignAbi, functionName: "evidenceReference", args: [2n], blockNumber: block.number,
  });
  const issuedAt = Math.floor(Date.now() / 1000);
  const binding = {
    requestId: randomUUID(), chainId: 5042002 as const, campaign,
    factory: ARC_TESTNET_DEPLOYMENT.factoryAddress,
    playbackCommitment, evidenceHash, blockNumber: block.number.toString(), blockHash: block.hash,
    issuedAt, expiresAt: issuedAt + 180,
  };
  const response = await fetch(url, {
    method: "POST", headers: { authorization: `Bearer ${requireServerEnv("CRE_RUNNER_SECRET")}`, "content-type": "application/json" },
    body: JSON.stringify({ ...binding, assetId }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(150000),
  });
  if (!response.ok) throw new Error("CRE runner is unavailable");
  const report = reviewReportSchema.parse(JSON.parse(new TextDecoder().decode(await readBounded(response, 16384))));
  for (const key of Object.keys(binding) as (keyof typeof binding)[]) {
    if (report[key] !== binding[key]) throw new Error("CRE report binding mismatch");
  }
  const expectedAction = encodeFunctionData({ abi: campaignAbi, functionName: "approveStage", args: [2, evidenceHash] });
  if (report.approvalCalldata !== expectedAction || report.ready !== Object.values(report.checks).every(Boolean)
    || report.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error("CRE report is invalid or expired");
  // Reject a report if its snapshot reorganized or the reviewed onchain inputs changed during execution.
  const [canonicalBlock, currentEvidence, currentCommitment] = await Promise.all([
    client.getBlock({ blockNumber: block.number }),
    client.readContract({ address: campaign, abi: campaignAbi, functionName: "evidenceReference", args: [2n] }),
    client.readContract({ address: campaign, abi: campaignAbi, functionName: "livepeerPlaybackIdHash" }),
  ]);
  if (canonicalBlock.hash !== block.hash || currentEvidence !== evidenceHash
    || currentCommitment.toLowerCase() !== playbackCommitment.toLowerCase()) throw new Error("Release changed during CRE review");
  return report;
}
