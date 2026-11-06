/** Maps wallet and contract failures to short, user-safe messages without raw stack traces. */
import {
  BaseError,
  ContractFunctionRevertedError,
} from "viem";

const REJECTED = "The request was rejected in your wallet.";
const UNSTARTED =
  "The transaction could not be started. Check your wallet and connection, then try again.";
const UNCONFIRMED =
  "The transaction was sent but is not confirmed yet. Check the explorer or your wallet.";

function rejectionMessage(error: unknown): string | undefined {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    const code = (cause as { code?: unknown }).code;
    if (code === 4001 || /user rejected|request rejected|user denied|request denied/i.test(cause.message))
      return REJECTED;
  }
  return undefined;
}

// On-chain custom error names (packages/abi) mapped to short user-safe messages.
const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  CreatorOnly: "Only the campaign creator can do this.",
  DisputePending: "A milestone dispute is pending; resolve it first.",
  EvidenceLocked: "This milestone's current evidence is already approved and locked.",
  FundingDeadlinePassed: "The funding deadline has already passed.",
  FundingGoalTooHigh: "This funding goal is too high for the configured backer repayment cap.",
  MilestoneNotOpen: "This milestone is not open yet; earlier approvals are still pending.",
  NothingToClaim: "There is nothing claimable for this wallet right now.",
  PitchReferenceRequired: "A Swarm pitch reference is required before this campaign can be created.",
  PlaybackReferenceRequired: "Final approval needs a configured film release first.",
  FinalApprovalRequired: "All three milestones must be approved by the reviewer before the film can be published.",
  ProductionStageRequired: "This action unlocks only during the Production stage.",
  RefundStageRequired: "Refunds unlock only in a refundable or cancelled stage.",
  ReviewerIndependent: "The reviewer must use a different wallet from the creator.",
  ReviewerOnly: "Only the configured reviewer can do this.",
};

function revertMessage(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk(
    (cause) => cause instanceof ContractFunctionRevertedError,
  );
  if (!(reverted instanceof ContractFunctionRevertedError)) return undefined;
  const name = reverted.data?.errorName;
  if (name && CONTRACT_ERROR_MESSAGES[name])
    return `The contract rejected the transaction: ${CONTRACT_ERROR_MESSAGES[name]}`;
  const detail = reverted.reason ?? name;
  if (!detail) return undefined;
  return `The contract rejected the transaction: ${detail.slice(0, 120)}.`;
}

export function transactionErrorMessage(error: unknown, submitted = false) {
  return (
    rejectionMessage(error) ??
    revertMessage(error) ??
    (submitted ? UNCONFIRMED : UNSTARTED)
  );
}
