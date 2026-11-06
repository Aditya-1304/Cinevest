"use client";

/**
 * Shared transaction lifecycle for every user-initiated write (deploy, contribute,
 * refund, claims, finalize/expire, milestones). States: idle, awaiting-wallet,
 * pending, confirmed, failed, uncertain. Success is only shown after the receipt
 * returns status "success"; a timeout or RPC error becomes "uncertain" with a
 * re-check, and resubmits of the same action stay blocked until it resolves.
 */
import {useCallback, useRef, useState} from "react"
import { type Hash, type TransactionReceipt } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { ARC_TESTNET } from "@/lib/chain";
import { transactionErrorMessage } from "@/lib/transaction-error";

export type TxState =
  | "idle"
  | "awaiting-wallet"
  | "pending"
  | "confirmed"
  | "failed"
  | "uncertain";

export type TxOutcome = "confirmed" | "reverted" | "uncertain" | "replaced";

export type TxResult = { outcome: TxOutcome; message: string };

type Snapshot = { state: TxState; message: string; action: string };
const IDLE: Snapshot = { state: "idle", message: "", action: "" };

const SENT =
  "The transaction was sent, but its receipt could not be confirmed in time. It may still confirm on-chain — do not resubmit this action yet. Check its status below.";

export function useTxFlow() {
  const { isConnected } = useAccount();
  const client = usePublicClient({ chainId: ARC_TESTNET.id });
  const [snapshot, setSnapshot] = useState<Snapshot>(IDLE);
  const [hash, setHash] = useState<Hash>();
  const [checking, setChecking] = useState(false);
  const hashRef = useRef<Hash | undefined>(undefined);

  const start = useCallback((action: string, message: string) => {
    hashRef.current = undefined;
    setHash(undefined);
    setSnapshot({ state: "awaiting-wallet", message, action });
  }, []);

  const update = useCallback((message: string) => {
    setSnapshot((prev) => ({ ...prev, message }));
  }, []);

  const confirmed = useCallback(
    (message: string, fallbackDisconnect: string) => {
      setSnapshot((prev) =>
        isConnected
          ? { ...prev, state: "confirmed", message }
          : { ...prev, state: "failed", message: fallbackDisconnect },
      );
    },
    [isConnected],
  );

  const failed = useCallback((error: unknown, submitted = false) => {
    setSnapshot((prev) => ({
      ...prev,
      state: "failed",
      message: transactionErrorMessage(error, submitted),
    }));
  }, []);

  /**
   * Waits for the receipt and settles the flow. Returns the outcome so callers
   * can branch, and the final user-facing message. `onSuccess` refetches
   * dependent reads (or returns a claim-specific message) before success shows.
   */
  const awaitConfirm = useCallback(
    async (
      txHash: Hash,
      onSuccess?: (receipt: TransactionReceipt) => Promise<string | void>,
    ): Promise<TxResult> => {
      hashRef.current = txHash;
      setHash(txHash);
      setSnapshot((prev) => ({ ...prev, state: "pending", message: "Waiting for confirmation…" }));
      if (!client)
        return { outcome: "uncertain", message: SENT.replace("its receipt could not be confirmed in time", "there is no RPC connection") };
      let bail: ((cause: Error) => void) | undefined;
      const bailed = new Promise<never>((_, reject) => {
        bail = reject;
      });
      try {
        const receipt = await Promise.race([
          client.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
            timeout: 120_000,
            onReplaced: (event) => {
              const replaced = event.transaction?.hash;
              if (replaced) {
                hashRef.current = replaced;
                setHash(replaced);
              }
              if (event.reason === "cancelled") {
                bail?.(new Error("cancelled"));
                return;
              }
              setSnapshot((prev) => ({
                ...prev,
                message: "The transaction was repriced or replaced; tracking the updated one…",
              }));
            },
          }),
          bailed,
        ]);
        if (receipt.status === "reverted") {
          const message = "The transaction reverted on-chain. No funds moved.";
          setSnapshot((prev) => ({ ...prev, state: "failed", message }));
          return { outcome: "reverted", message };
        }
        let message: string | undefined;
        // A refetch failure after a confirmed receipt must not fake success.
        try {
          message = (await onSuccess?.(receipt)) || undefined;
        } catch {
          /* ignore */
        }
        const final = message ?? "Transaction confirmed.";
        confirmed(final, "The transaction confirmed on-chain, but your wallet disconnected. Check it in the explorer instead.");
        return { outcome: "confirmed", message: final };
      } catch (cause) {
        const result: TxResult =
          (cause as Error)?.message === "cancelled"
            ? {
                outcome: "replaced",
                message: "The transaction was cancelled or replaced in your wallet before it confirmed; do not assume it went through.",
              }
            : { outcome: "uncertain", message: SENT };
        setSnapshot((prev) => ({ ...prev, state: result.outcome === "uncertain" ? "uncertain" : "failed", message: result.message }));
        return result;
      }
    },
    [client, confirmed],
  );

  /** Re-query a pending receipt after "uncertain"; never flags success on its own. */
  const checkStatus = useCallback(async () => {
    const target = hashRef.current;
    if (!target || !client) return;
    setChecking(true);
    setSnapshot((prev) => ({ ...prev, message: "Checking the transaction status…" }));
    try {
      const receipt = await client.getTransactionReceipt({ hash: target });
      if (receipt.status === "success")
        confirmed(
          "Transaction confirmed on-chain.",
          "The transaction confirmed on-chain, but your wallet disconnected. Check it in the explorer instead.",
        );
      else if (receipt.status === "reverted") {
        setSnapshot((prev) => ({
          ...prev,
          state: "failed",
          message: "The transaction reverted on-chain. No funds moved.",
        }));
      } else
        setSnapshot((prev) => ({
          ...prev,
          message: "The node returned no clear status. The transaction may still confirm — check again shortly.",
        }));
    } catch {
      setSnapshot((prev) => ({ ...prev, message: "The transaction is not visible to the node yet. It may still confirm or be dropped — check again shortly." }));
    } finally {
      setChecking(false);
    }
  }, [client, confirmed]);

  const reset = useCallback(() => {
    hashRef.current = undefined;
    setHash(undefined);
    setSnapshot(IDLE);
  }, []);

  return {
    /** Current state snapshot for rendering. */
    ...snapshot,
    hash,
    checking,
    busy: snapshot.state === "awaiting-wallet" || snapshot.state === "pending",
    start,
    update,
    awaitConfirm,
    failed,
    checkStatus,
    reset,
  };
}

export type TxFlow = ReturnType<typeof useTxFlow>;
