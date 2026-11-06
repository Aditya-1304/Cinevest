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

function revertMessage(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk(
    (cause) => cause instanceof ContractFunctionRevertedError,
  );
  if (!(reverted instanceof ContractFunctionRevertedError)) return undefined;
  const detail = reverted.reason ?? reverted.data?.errorName;
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
