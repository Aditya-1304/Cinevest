"use client";

import type { Hash } from "viem";
import type { TxState } from "@/lib/use-tx-flow";
import { ARC_TESTNET } from "@/lib/chain";

const TONES: Record<TxState, string> = {
  idle: "text-white/70",
  "awaiting-wallet": "text-amber-300",
  pending: "text-amber-300",
  confirmed: "text-[#d3ed05]",
  failed: "text-red-300",
  uncertain: "text-amber-300",
};

/**
 * One canonical transaction status banner: live region text, explorer link for
 * the last hash, and a re-check button while the receipt is uncertain.
 */
export function TxStatus({
  state,
  message,
  hash,
  checking,
  checkingAction,
}: {
  state: TxState;
  message: string;
  hash?: Hash;
  checking?: boolean;
  checkingAction?: () => void;
}) {
  if (state === "idle") return null;
  return (
    <div className="space-y-1">
      <p role="status" aria-live="polite" className={`text-xs leading-[1.6] break-all ${TONES[state]}`}>
        {message}
      </p>
      {hash && (
        <a
          className="block break-all text-xs font-semibold text-primary underline"
          target="_blank"
          rel="noreferrer"
          href={`${ARC_TESTNET.blockExplorers.default.url}/tx/${hash}`}
        >
          View transaction
        </a>
      )}
      {checkingAction && state === "uncertain" && (
        <button
          type="button"
          className="text-xs font-semibold underline"
          onClick={checkingAction}
        >
          {checking ? "Checking…" : "Check status again"}
        </button>
      )}
    </div>
  );
}
