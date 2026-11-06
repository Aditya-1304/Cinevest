import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http, isAddress, parseAbiItem } from "viem";
import { arcTestnet } from "viem/chains";

// Usage: node scripts/claim-trace.mjs CAMPAIGN [OUTPUT.json]. RPC must retain historical state.
const [campaign, output = "claim-trace.json"] = process.argv.slice(2);
if (!campaign || !isAddress(campaign)) throw new Error("Supply an Arc campaign address");
const abi = JSON.parse(await readFile(new URL("../packages/abi/abi/Campaign.json", import.meta.url)));
const tokenAbi = JSON.parse(await readFile(new URL("../packages/abi/abi/IERC20.json", import.meta.url)));
const client = createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL) });
if (await client.getChainId() !== arcTestnet.id) throw new Error("Arc Testnet RPC required");
const blockNumber = await client.getBlockNumber();
const read = (functionName, args = []) => client.readContract({ address: campaign, abi, functionName, args, blockNumber });
const terms = await read("getTerms");
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const logs = [];
const transfers = [];
// Bounded RPC ranges avoid provider log limits. Scan from genesis to include the full accounting history.
const fromBlock = BigInt(process.env.FROM_BLOCK ?? "0");
if (fromBlock < 0n || fromBlock > blockNumber) throw new Error("Invalid FROM_BLOCK");
if (fromBlock > 0n && await client.getCode({ address: campaign, blockNumber: fromBlock - 1n }))
  throw new Error("FROM_BLOCK must be at or before campaign deployment");
for (let start = fromBlock; start <= blockNumber; start += 2000n) {
  const end = start + 1999n < blockNumber ? start + 1999n : blockNumber;
  const [events, incoming, outgoing] = await Promise.all([
    client.getContractEvents({ address: campaign, abi, fromBlock: start, toBlock: end, strict: true }),
    client.getLogs({ address: terms.usdc, event: transfer, args: { to: campaign }, fromBlock: start, toBlock: end, strict: true }),
    client.getLogs({ address: terms.usdc, event: transfer, args: { from: campaign }, fromBlock: start, toBlock: end, strict: true }),
  ]);
  logs.push(...events);
  transfers.push(...incoming, ...outgoing);
}
logs.sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex);
const units = new Map(), paid = new Map(), payouts = [];
let raised = 0n, index = 0n, remainder = 0n, funder = 0n, creator = 0n, funderPaid = 0n, creatorPaid = 0n;
const Q = 10n ** 27n;
const failures = [];
let productionPaid = 0n, refundsPaid = 0n, cancellationPool = 0n, stage = 0;
let releasedAt = 0n;
const timestamps = new Map();
const evidence = [], approved = [], rejected = new Set(), pending = new Set();
const refunded = new Set();
const cumulative = [terms.fundingGoal * 40n / 100n, terms.fundingGoal * 70n / 100n, terms.fundingGoal];
for (const event of logs) {
  const a = event.args;
  if (event.eventName === "FilmReleased") releasedAt = a.releasedAt;
  if (event.eventName === "StageChanged") stage = a.stage;
  if (event.eventName === "EvidenceSubmitted") evidence[a.milestoneIndex] = a.evidenceReference;
  if (event.eventName === "MilestoneApproved") approved[a.milestoneIndex] = a.evidenceReference;
  if (event.eventName === "StageDisputed") pending.add(a.milestoneIndex);
  if (event.eventName === "DisputeResolved") {
    pending.delete(a.milestoneIndex);
    if (a.disputeApproved) rejected.add(a.milestoneIndex + ":" + a.evidenceReference);
  }
  if (event.eventName === "ProductionCancelled") cancellationPool = a.remainingEscrow;
  if (event.eventName === "ContributionReceived") {
    const wallet = a.backer.toLowerCase();
    units.set(wallet, (units.get(wallet) ?? 0n) + a.amount);
    raised += a.amount;
    if (raised !== a.totalRaised) failures.push("Contribution running total mismatch");
  }
  if (event.eventName === "RevenueCredited") {
    const receipt = logs.find((other) => other.transactionHash === event.transactionHash
      && ["WatchPurchased", "SponsorDeposited"].includes(other.eventName));
    if (!receipt) throw new Error("Revenue source missing");
    const amount = receipt.eventName === "WatchPurchased" ? receipt.args.price : receipt.args.amount;
    if (!timestamps.has(event.blockNumber)) timestamps.set(event.blockNumber, (await client.getBlock({ blockNumber: event.blockNumber })).timestamp);
    const cap = raised * BigInt(terms.repaymentCapBps) / 10000n;
    const share = amount * BigInt(terms.funderBps) / 10000n;
    const expectedShare = timestamps.get(event.blockNumber) < releasedAt + terms.rightsDuration && funder < cap
      ? (share < cap - funder ? share : cap - funder) : 0n;
    if (a.funderAmount !== expectedShare || a.creatorAmount !== amount - expectedShare) failures.push("Revenue waterfall mismatch");
    funder += a.funderAmount; creator += a.creatorAmount;
    if (a.funderAmount) {
      if (!raised) throw new Error("Revenue without contribution units");
      const scaled = a.funderAmount * Q + remainder;
      index += scaled / raised; remainder = scaled % raised;
    }
  }
  if (event.eventName === "PayoutPaid") {
    const wallet = a.claimant.toLowerCase();
    let expected = 0n;
    if (a.kind === 0 || a.kind === 4) {
      expected = refunded.has(wallet) ? 0n : a.kind === 0
        ? (units.get(wallet) ?? 0n)
        : (units.get(wallet) ?? 0n) * cancellationPool / raised;
      refunded.add(wallet); refundsPaid += a.amount;
    }
    if (a.kind === 1) {
      let eligible = cumulative[0];
      for (let milestone = 1; milestone <= 2; milestone++) {
        if (!evidence[milestone] || approved[milestone] !== evidence[milestone]
          || rejected.has(milestone + ":" + evidence[milestone])) break;
        eligible = cumulative[milestone];
      }
      expected = pending.size || ![2, 3].includes(stage) ? 0n : eligible - productionPaid;
      productionPaid += a.amount;
    }
    if (a.kind === 2) {
      expected = (units.get(wallet) ?? 0n) * index / Q - (paid.get(wallet) ?? 0n);
      paid.set(wallet, (paid.get(wallet) ?? 0n) + a.amount); funderPaid += a.amount;
    }
    if (a.kind === 3) { expected = creator - creatorPaid; creatorPaid += a.amount; }
    if (expected !== a.amount) failures.push("Payout entitlement mismatch: " + event.transactionHash);
    const matching = transfers.filter((t) => t.transactionHash === event.transactionHash
      && t.args.from.toLowerCase() === campaign.toLowerCase() && t.args.to.toLowerCase() === wallet && t.args.value === a.amount);
    if (matching.length !== 1) failures.push("Payout transfer mismatch: " + event.transactionHash);
    payouts.push({ wallet, kind: a.kind, amount: a.amount, expected, transactionHash: event.transactionHash, logIndex: event.logIndex });
  }
}
const expected = { paidTrancheAmount: productionPaid, refundsPaid, raised, accRewardPerUnit: index, scaledRemainder: remainder, funderAllocated: funder, creatorAllocated: creator, funderClaimed: funderPaid, creatorClaimed: creatorPaid };
for (const [name, value] of Object.entries(expected)) if (await read(name) !== value) failures.push(name + " mismatch");
for (const [wallet, amount] of paid) if (await read("funderClaimedBy", [wallet]) !== amount) failures.push("Wallet paid mismatch: " + wallet);
const balance = await client.readContract({ address: terms.usdc, abi: tokenAbi, functionName: "balanceOf", args: [campaign], blockNumber });
const reserved = await read("reservedUSDC");
let transferBalance = 0n;
for (const t of transfers) {
  if (t.args.to.toLowerCase() === campaign.toLowerCase() && t.args.from.toLowerCase() !== campaign.toLowerCase()) transferBalance += t.args.value;
  if (t.args.from.toLowerCase() === campaign.toLowerCase() && t.args.to.toLowerCase() !== campaign.toLowerCase()) transferBalance -= t.args.value;
}
if (transferBalance !== balance) failures.push("USDC transfer history does not reproduce balance");
if (balance < reserved) failures.push("Campaign is insolvent");
const report = { chainId: arcTestnet.id, campaign, blockNumber, fromBlock, expected, balance, reserved, unreserved: balance - reserved, payouts, failures, reconciled: failures.length === 0 };
await writeFile(output, JSON.stringify(report, (_, value) => typeof value === "bigint" ? value.toString() : value, 2) + "\n");
console.log(output + ": " + (report.reconciled ? "reconciled" : "FAILED"));
if (failures.length) process.exitCode = 1;
