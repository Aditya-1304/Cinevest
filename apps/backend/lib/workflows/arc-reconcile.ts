import { decodeEventLog } from "viem";

/** Mirrors the factory's canonical CampaignCreated event; kept local so it is testable offline. */
export const campaignCreatedEvent = {
  type: "event",
  name: "CampaignCreated",
  inputs: [
    { name: "creator", type: "address", indexed: true },
    { name: "campaign", type: "address", indexed: true },
  ],
} as const;

export type RawLog = {
  address: string;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
};

/** Reconciles an uncertain deployment by matching the canonical factory event, never by guesswork. */
export function findCreatedCampaign(
  logs: readonly RawLog[],
  factory: string,
  creator: string,
) {
  for (const log of logs) {
    if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
    try {
      const event = decodeEventLog({
        abi: [campaignCreatedEvent],
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (event.args.creator.toLowerCase() === creator.toLowerCase()) {
        return event.args.campaign;
      }
    } catch {
      // A factory log that is not CampaignCreated carries no campaign identity.
    }
  }
  return null;
}

type TxLog = RawLog & { transactionHash?: string | null };

/** Restricts factory reconciliation to CampaignCreated logs emitted by the persisted transaction. */
export function findCreatedCampaignFromTx(
  logs: readonly TxLog[],
  factory: string,
  creator: string,
  arcTxHash: string,
) {
  const txHash = arcTxHash.toLowerCase();
  const bound = logs.filter(
    (log) =>
      typeof log.transactionHash === "string" &&
      log.transactionHash.toLowerCase() === txHash,
  );
  return findCreatedCampaign(bound, factory, creator);
}

/** The intended-term fields a campaign must match, with the decimal/bigint wire representations. */
const TERM_BIGINT_FIELDS = [
  "fundingGoal",
  "watchPrice",
  "fundingDeadline",
  "productionDeadline",
  "rightsDuration",
  "perHumanLimit",
] as const;

const TERM_ADDRESS_FIELDS = ["creator", "reviewer", "usdc"] as const;

function termValue(intended: Record<string, unknown>, field: string) {
  const value = intended[field];
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  return null;
}

function addressMatches(actual: string, intended: unknown) {
  return (
    typeof intended === "string" &&
    actual.toLowerCase() === intended.toLowerCase()
  );
}

/**
 * Exact reconciliation binding: an on-chain campaign's terms have to equal the actor-signed
 * intended terms, so a same-creator campaign from a different deployment cannot be adopted.
 */
export function campaignTermsMatch(
  actual: Record<string, unknown> | null | undefined,
  intended: Record<string, unknown> | null | undefined,
) {
  if (!actual || !intended) return false;
  for (const field of TERM_ADDRESS_FIELDS) {
    const value = actual[field];
    if (typeof value !== "string" || !addressMatches(value, intended[field])) {
      return false;
    }
  }
  for (const field of TERM_BIGINT_FIELDS) {
    let expected: bigint | null;
    try {
      expected = termValue(intended, field);
    } catch {
      return false;
    }
    if (expected === null || actual[field] !== expected) return false;
  }
  if (
    typeof actual.pitchReference !== "string" ||
    typeof intended.pitchReference !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(actual.pitchReference) ||
    actual.pitchReference.toLowerCase() !== intended.pitchReference.toLowerCase()
  ) {
    return false;
  }
  if (
    actual.funderBps !== Number(intended.funderBps) ||
    actual.repaymentCapBps !== Number(intended.repaymentCapBps)
  ) {
    return false;
  }
  if (actual.worldGated !== Boolean(intended.worldGated)) return false;
  return true;
}
