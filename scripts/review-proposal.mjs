import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http, isAddress, encodeFunctionData, keccak256, recoverTypedDataAddress } from "viem";
import { arcTestnet } from "viem/chains";

const abi = JSON.parse(await readFile(new URL("../packages/abi/abi/Campaign.json", import.meta.url)));
const reviewerAbi = JSON.parse(await readFile(new URL("../packages/abi/abi/ThresholdReviewer.json", import.meta.url)));
const client = createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL) });
const types = { Review: [
  { name: "campaign", type: "address" }, { name: "actionHash", type: "bytes32" },
  { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
] };
if (await client.getChainId() !== arcTestnet.id) throw new Error("Arc Testnet is required");
const [mode, input, extra, output = "review-proposal.json"] = process.argv.slice(2);

if (mode === "prepare") {
  const campaign = input, index = Number(extra);
  if (!isAddress(campaign) || ![1, 2].includes(index)) throw new Error("Usage: review-proposal.mjs prepare CAMPAIGN MILESTONE_INDEX [OUTPUT.json]");
  const terms = await client.readContract({ address: campaign, abi, functionName: "getTerms" });
  const committee = terms.reviewer;
  const [nonce, evidence, block, threshold, creatorIsSigner] = await Promise.all([
    client.readContract({ address: committee, abi: reviewerAbi, functionName: "nonces", args: [campaign] }),
    client.readContract({ address: campaign, abi, functionName: "evidenceReference", args: [BigInt(index)] }),
    client.getBlock(),
    client.readContract({ address: committee, abi: reviewerAbi, functionName: "threshold" }),
    client.readContract({ address: committee, abi: reviewerAbi, functionName: "isSigner", args: [terms.creator] }),
  ]);
  if (creatorIsSigner) throw new Error("Committee must be independent of this creator");
  if (/^0x0{64}$/.test(evidence)) throw new Error("Milestone evidence is absent");
  const action = encodeFunctionData({ abi, functionName: "approveStage", args: [index, evidence] });
  const deadline = block.timestamp + 3600n;
  const proposal = {
    committee, action, threshold: threshold.toString(),
    typedData: { domain: { name: "CinevestThresholdReviewer", version: "1", chainId: arcTestnet.id, verifyingContract: committee },
      types, primaryType: "Review", message: { campaign, actionHash: keccak256(action), nonce: nonce.toString(), deadline: deadline.toString() } },
  };
  await writeFile(output, JSON.stringify(proposal, null, 2) + "\n");
  console.log("Share the same proposal with committee signers; each signs typedData after reviewing its evidence.");
} else if (mode === "assemble") {
  if (!input || !extra) throw new Error("Usage: review-proposal.mjs assemble PROPOSAL.json SIGNATURES.json [OUTPUT.json]");
  const proposal = JSON.parse(await readFile(input, "utf8"));
  const signatures = JSON.parse(await readFile(extra, "utf8"));
  if (!Array.isArray(signatures) || signatures.some(s => typeof s !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(s))) throw new Error("Supply a JSON array of 65-byte signatures");
  // Rebuild the schema locally; proposal-supplied domains/types cannot silently change the review protocol.
  const typedData = { domain: { name: "CinevestThresholdReviewer", version: "1", chainId: arcTestnet.id, verifyingContract: proposal.committee },
    types, primaryType: "Review", message: { campaign: proposal.typedData.message.campaign, actionHash: keccak256(proposal.action),
      nonce: BigInt(proposal.typedData.message.nonce), deadline: BigInt(proposal.typedData.message.deadline) } };
  const recovered = await Promise.all(signatures.map(async signature => ({ signature,
    signer: (await recoverTypedDataAddress({ ...typedData, signature })).toLowerCase() })));
  recovered.sort((a, b) => a.signer.localeCompare(b.signer));
  const ordered = recovered.map(item => item.signature);
  const args = [typedData.message.campaign, proposal.action, typedData.message.deadline, ordered];
  await client.simulateContract({ address: proposal.committee, abi: reviewerAbi, functionName: "execute", args });
  const data = encodeFunctionData({ abi: reviewerAbi, functionName: "execute", args });
  await writeFile(output, JSON.stringify({ chainId: arcTestnet.id, to: proposal.committee, data, value: "0" }, null, 2) + "\n");
  console.log("Execution simulated successfully. Submit the exported transaction with any Arc wallet before expiry.");
} else {
  throw new Error("Choose prepare or assemble");
}
