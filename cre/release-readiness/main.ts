import {
  Runner, HTTPCapability, HTTPClient, EVMClient, handler, consensusIdenticalAggregation,
  encodeCallMsg, bytesToHex, blockNumber, getNetwork,
  type Runtime, type HTTPPayload, type HTTPSendRequester,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, keccak256, stringToBytes, zeroAddress, zeroHash, type Address, type Hex } from "viem";
import { z } from "zod";
import { campaignAbi } from "../../packages/abi/src/campaign";
import { campaignFactoryAbi } from "../../packages/abi/src/campaignFactory";
import { reviewRequestSchema, reviewReportSchema, REPORT_MARKER, type ReviewRequest } from "../protocol";

type Config = Record<string, never>;
const assetSchema = z.object({ data: z.object({
  id: z.string(), status: z.string(), playback_ids: z.array(z.object({
    id: z.string().min(1), policy: z.string(),
  })).default([]),
}) });

/** Reduce Mux's private response before consensus; identifiers and credentials never enter the report. */
function readMux(requester: HTTPSendRequester, input: { assetId: string; authorization: string; commitment: string }) {
  const response = requester.sendRequest({
    url: `https://api.mux.com/video/v1/assets/${encodeURIComponent(input.assetId)}`,
    method: "GET", headers: { Authorization: input.authorization },
  }).result();
  if (response.statusCode !== 200) throw new Error("Mux asset lookup unavailable");
  const asset = assetSchema.parse(JSON.parse(new TextDecoder().decode(response.body))).data;
  return {
    providerReady: asset.id === input.assetId && asset.status === "ready",
    signedOnly: asset.playback_ids.length > 0 && asset.playback_ids.every(id => id.policy === "signed"),
    commitmentMatches: asset.playback_ids.some(id =>
      id.policy === "signed" && keccak256(stringToBytes(id.id)).toLowerCase() === input.commitment.toLowerCase()),
  };
}

/** Local CRE orchestration supports human review; it never signs an approval or moves escrow. */
function onReview(runtime: Runtime<Config>, payload: HTTPPayload): string {
  const request: ReviewRequest = reviewRequestSchema.parse(JSON.parse(new TextDecoder().decode(payload.input)));
  const { assetId, ...binding } = request;
  const now = Math.floor(runtime.now().getTime() / 1000);
  if (request.issuedAt > now + 5 || request.issuedAt < now - 30 || request.expiresAt <= now
    || request.expiresAt > request.issuedAt + 180) throw new Error("Review request expired");
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: "arc-testnet" });
  if (!network) throw new Error("Arc Testnet is unavailable in this SDK");
  const evm = new EVMClient(network.chainSelector.selector);
  const atBlock = blockNumber(BigInt(request.blockNumber));
  const call = (address: Address, data: Hex, from: Address = zeroAddress) => bytesToHex(evm.callContract(runtime, {
    call: encodeCallMsg({ from, to: address, data }), blockNumber: atBlock,
  }).result().data);
  const registered = decodeFunctionResult({
    abi: campaignFactoryAbi, functionName: "isCampaign",
    data: call(request.factory as Address, encodeFunctionData({ abi: campaignFactoryAbi, functionName: "isCampaign", args: [request.campaign as Address] })),
  });
  if (!registered) throw new Error("Campaign is not registered");
  // Static campaign state is pinned to the same block selected by the authenticated backend.
  const readData = (functionName: "getStage" | "getTerms" | "livepeerPlaybackIdHash" | "withdrawableTrancheAmount") =>
    call(request.campaign as Address, encodeFunctionData({ abi: campaignAbi, functionName }));
  const terms = decodeFunctionResult({ abi: campaignAbi, functionName: "getTerms", data: readData("getTerms") });
  const stage = decodeFunctionResult({ abi: campaignAbi, functionName: "getStage", data: readData("getStage") });
  const commitment = decodeFunctionResult({ abi: campaignAbi, functionName: "livepeerPlaybackIdHash", data: readData("livepeerPlaybackIdHash") });
  const eligible = decodeFunctionResult({ abi: campaignAbi, functionName: "withdrawableTrancheAmount", data: readData("withdrawableTrancheAmount") });
  const evidence = decodeFunctionResult({ abi: campaignAbi, functionName: "evidenceReference",
    data: call(request.campaign as Address, encodeFunctionData({ abi: campaignAbi, functionName: "evidenceReference", args: [2n] })) });
  const disputes = [1n, 2n].map(index => decodeFunctionResult({ abi: campaignAbi, functionName: "disputeStatus",
    data: call(request.campaign as Address, encodeFunctionData({ abi: campaignAbi, functionName: "disputeStatus", args: [index] })) }));
  const rejected = decodeFunctionResult({ abi: campaignAbi, functionName: "isEvidenceRejected",
    data: call(request.campaign as Address, encodeFunctionData({ abi: campaignAbi, functionName: "isEvidenceRejected", args: [2n] })) });
  const authorization = runtime.getSecret({ id: "MUX_READ_AUTHORIZATION" }).result().value;
  const mux = new HTTPClient().sendRequest(runtime, readMux, consensusIdenticalAggregation<ReturnType<typeof readMux>>())({
    assetId, authorization, commitment: request.playbackCommitment,
  }).result();
  const approvalCalldata = encodeFunctionData({ abi: campaignAbi, functionName: "approveStage", args: [2, request.evidenceHash as Hex] });
  let approvalAllowed = false;
  // eth_call previews Campaign's exact guards from the configured reviewer; it never submits a transaction.
  try { call(request.campaign as Address, approvalCalldata, terms.reviewer); approvalAllowed = true; }
  catch { approvalAllowed = false; }
  const checks = {
    registered, approvalAllowed, production: stage === 2,
    evidenceMatches: evidence !== zeroHash && evidence.toLowerCase() === request.evidenceHash.toLowerCase() && !rejected,
    previousMilestoneApproved: eligible >= terms.fundingGoal * 70n / 100n,
    disputesClear: disputes.every(status => status !== 1),
    commitmentMatches: commitment !== zeroHash && commitment.toLowerCase() === request.playbackCommitment.toLowerCase() && mux.commitmentMatches,
    providerReady: mux.providerReady, signedOnly: mux.signedOnly,
  };
  const report = reviewReportSchema.parse({
    ...binding, schema: "Cinevest.cre-release.v1", execution: "cre-cli-simulation", checks,
    ready: Object.values(checks).every(Boolean),
    approvalCalldata,
  });
  const json = JSON.stringify(report);
  runtime.log(REPORT_MARKER + json);
  return json;
}

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(() => [handler(new HTTPCapability().trigger({}), onReview)]);
}
