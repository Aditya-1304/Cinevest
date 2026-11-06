"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi, parseUnits, zeroAddress, type Abi, type Address } from "viem";
import { useAccount, usePublicClient, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
import { campaignAbi, type ViewingReceiptGrant } from "@cinevest/abi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TxStatus } from "@/components/ui/tx-status";
import { ARC_TESTNET } from "@/lib/chain";
import { formatUsdc } from "@/lib/format";
import { useSession } from "@/lib/use-session";
import { useTxFlow } from "@/lib/use-tx-flow";
import { fetchViewingStatus, postViewing } from "@/lib/viewing";

const RELEASED = 3;
const PRESET_MINUTES = [15, 30];
const REFUND_ERRORS: Record<string, string> = {
  nothing_to_refund: "This wallet has no viewing balance to refund.",
  not_released: "This film is not released.",
};

const maxBigint = (a: bigint, b: bigint) => (a > b ? a : b);
const minBigint = (a: bigint, b: bigint) => (a < b ? a : b);

function parseAmount(value: string) {
  try { return parseUnits(value.trim() || "0", 6); } catch { return null; }
}

/**
 * Viewer's refundable pay-per-minute balance. Arc holds the money, so these actions are the same whether
 * or not playback is running; the backend only contributes usage and the closing receipt that refunds
 * instantly. Request exit is the path that needs no backend at all.
 */
export function ViewingEscrow({ campaign }: { campaign: Address }) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: ARC_TESTNET.id });
  const writer = useWriteContract();
  const switchChain = useSwitchChain();
  const cache = useQueryClient();
  const flow = useTxFlow();
  const session = useSession();
  const [amount, setAmount] = useState("");
  const wallet = address ?? zeroAddress;
  const call = { address: campaign, abi: campaignAbi, chainId: ARC_TESTNET.id } as const;
  const reads = useReadContracts({
    contracts: [
      { ...call, functionName: "getStage" },
      { ...call, functionName: "hasPaidAccess", args: [wallet] },
      { ...call, functionName: "viewingAccounts", args: [wallet] },
      { ...call, functionName: "getTerms" },
    ],
    query: { refetchInterval: 15_000 },
  });
  const status = useQuery({
    queryKey: ["viewing-status", campaign, address, session.active],
    queryFn: () => fetchViewingStatus(campaign),
    refetchInterval: 15_000,
  });

  const [stage, paid, position, terms] = reads.data?.map((read) => read.result) ?? [];
  const viewing = status.data;
  if (stage !== RELEASED || !viewing?.metered || !position || !terms) return null;

  const [balance, chainCharged, , exitAt] = position as readonly [bigint, bigint, bigint, bigint];
  const { usdc } = terms as { usdc: Address };
  const price = BigInt(viewing.price);
  const account = viewing.account;
  const used = maxBigint(BigInt(account?.charged ?? 0), chainCharged);
  const reserved = BigInt(account?.reserved ?? 0);
  const refundable = maxBigint(0n, balance - (used - chainCharged) - reserved);
  const room = price - chainCharged - balance;
  const perMinute = price * 60n / BigInt(viewing.durationSeconds);
  const deposit = parseAmount(amount);
  const coversMinutes = deposit ? Number(deposit * BigInt(viewing.durationSeconds) / price) / 60 : 0;
  const exitReady = exitAt !== 0n && status.dataUpdatedAt >= Number(exitAt) * 1000;
  const ready = !!address && !flow.busy && flow.state !== "uncertain";
  const canDeposit = ready && !paid && !!deposit && deposit > 0n && deposit <= room;

  const presetAmount = (minutes: number) =>
    minBigint(room, (price * BigInt(minutes * 60) + BigInt(viewing.durationSeconds) - 1n) / BigInt(viewing.durationSeconds));

  /** Simulates, sends and confirms one campaign write using the shared transaction lifecycle. */
  async function send(
    target: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] },
    prompt: string,
    success: string,
  ) {
    if (!address || !client) return false;
    flow.start(target.functionName, prompt);
    let submitted = false;
    try {
      const { request } = await client.simulateContract({ ...target, account: address });
      const tx = await writer.writeContractAsync({ ...request, chainId: ARC_TESTNET.id } as Parameters<typeof writer.writeContractAsync>[0]);
      submitted = true;
      const result = await flow.awaitConfirm(tx, async () => { await cache.invalidateQueries(); return success; });
      return result.outcome === "confirmed";
    } catch (error) {
      flow.failed(error, submitted);
      return false;
    }
  }

  const campaignWrite = (functionName: string, args?: readonly unknown[]) =>
    ({ address: campaign, abi: campaignAbi as Abi, functionName, args });

  async function addFunds() {
    if (!canDeposit || !address || !client || !deposit) return;
    if (chainId !== ARC_TESTNET.id) return switchChain.switchChain({ chainId: ARC_TESTNET.id });
    const allowance = await client.readContract({ address: usdc, abi: erc20Abi, functionName: "allowance", args: [address, campaign] });
    if (allowance < deposit) {
      const approved = await send({ address: usdc, abi: erc20Abi as Abi, functionName: "approve", args: [campaign, deposit] },
        "Approve test USDC in your wallet.", "Approved. Confirm the deposit next.");
      if (!approved) return;
    }
    if (await send(campaignWrite("depositViewing", [deposit]), "Confirm the deposit in your wallet.", "Viewing balance added. Unused funds stay refundable.")) setAmount("");
  }

  async function stopAndRefund() {
    if (!ready) return;
    if (chainId !== ARC_TESTNET.id) return switchChain.switchChain({ chainId: ARC_TESTNET.id });
    flow.start("refund", "Stopping playback and preparing your refund.");
    try {
      const response = await postViewing("close", campaign, { positionSeconds: account?.positionSeconds ?? 0, played: [] });
      const body = (await response.json()) as ViewingReceiptGrant & { error?: string };
      if (!response.ok) throw new Error(REFUND_ERRORS[body.error ?? ""] ?? "The meter is unavailable. Use Request exit instead.");
      const { receipt, signature } = body;
      await send(campaignWrite("settleAndWithdrawViewing", [{
        ...receipt, sequence: BigInt(receipt.sequence), cumulativeCharge: BigInt(receipt.cumulativeCharge),
        spendCap: BigInt(receipt.spendCap), deadline: BigInt(receipt.deadline),
      }, signature]), "Confirm the refund in your wallet.", "Usage settled and unused balance refunded.");
    } catch (error) {
      flow.failed(error, false);
    }
  }

  return (
    <Card>
      <CardHeader className="p-3">
        <CardTitle className="font-dela text-lg uppercase">Pay as you watch</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        <p>
          Full film: {formatUsdc(price)} test USDC · about {formatUsdc(perMinute)} per minute. You pay once for each
          5-second block you play, and never more than the full price. Network fees are separate.
        </p>
        <p className="text-xs">
          Pausing, buffering, skipping ahead and rewatching add no charge. Up to 5 minutes of delivered but unplayed
          video is free; beyond that it is charged, because delivery cannot be undone. Cinevest&apos;s meter reports
          usage; the contract limits charges to your deposit and the full price.
        </p>
        {address && (
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt>Viewing balance</dt><dd className="text-right">{formatUsdc(balance)}</dd>
            <dt>Used so far</dt><dd className="text-right">{formatUsdc(used)}</dd>
            <dt>Held for buffered video</dt><dd className="text-right">{formatUsdc(reserved)}</dd>
            <dt>Refundable now</dt><dd className="text-right">{formatUsdc(refundable)}</dd>
          </dl>
        )}
        {!address ? <p>Connect your wallet to add a viewing balance.</p> : (
          <>
            {!paid && room > 0n && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {PRESET_MINUTES.map((minutes) => (
                    <Button key={minutes} type="button" variant="outline" onClick={() => setAmount(formatUsdc(presetAmount(minutes)))}>
                      {minutes} min
                    </Button>
                  ))}
                  <Button type="button" variant="outline" onClick={() => setAmount(formatUsdc(room))}>Rest of film</Button>
                </div>
                <Input aria-label="Deposit amount in test USDC" inputMode="decimal" placeholder="Amount in test USDC"
                  value={amount} onChange={(event) => setAmount(event.target.value)} />
                {deposit !== null && deposit > room && <p role="alert">The most you can add is {formatUsdc(room)} test USDC.</p>}
                {deposit !== null && deposit > 0n && deposit <= room && <p>Covers about {coversMinutes.toFixed(1)} minutes.</p>}
                <Button disabled={!canDeposit} onClick={() => void addFunds()}>
                  {flow.busy ? "Transaction pending…" : "Add viewing balance"}
                </Button>
              </div>
            )}
            {balance > 0n && (paid || exitReady ? (
              <Button disabled={!ready} onClick={() => void send(campaignWrite("withdrawViewing"), "Confirm the withdrawal in your wallet.", "Viewing balance withdrawn.")}>
                Withdraw {formatUsdc(balance)} test USDC
              </Button>
            ) : (
              <div className="space-y-2">
                {session.active ? (
                  <Button disabled={!ready} onClick={() => void stopAndRefund()}>Stop and refund unused balance</Button>
                ) : (
                  <Button disabled={session.busy} onClick={() => void session.signIn()}>Sign in to refund instantly</Button>
                )}
                {exitAt !== 0n ? (
                  <p role="status">Exit pending: withdraw from {new Date(Number(exitAt) * 1000).toLocaleString()}. Adding funds cancels it.</p>
                ) : (
                  <p className="text-xs">
                    Refund not working?{" "}
                    <button type="button" className="underline" disabled={!ready}
                      onClick={() => void send(campaignWrite("requestViewingExit"), "Confirm the exit request in your wallet.", "Exit requested. Withdraw after the 6-hour settlement window.")}>
                      Request exit
                    </button>{" "}
                    to withdraw after 6 hours, with no help from Cinevest.
                  </p>
                )}
              </div>
            ))}
            <TxStatus state={flow.state} message={flow.message} hash={flow.hash} checking={flow.checking}
              checkingAction={() => void flow.checkStatus()} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
