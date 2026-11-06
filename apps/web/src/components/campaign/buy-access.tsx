"use client";

import Link from "next/link";
import {
  useAccount,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  erc20Abi,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import {
  ARC_TESTNET,
  type CampaignTerms,
} from "@/lib/chain";
import { formatUsdc } from "@/lib/format";
import { campaignAbi } from "@cinevest/abi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TxStatus } from "@/components/ui/tx-status";
import { useTxFlow } from "@/lib/use-tx-flow";
import { watchPath } from "@/lib/paths";

/**
 * Viewer-side purchase card for Released campaigns. Mirrors the approve-then-buy
 * flow of CampaignActions; access is judged by hasPaidAccess, the same view the
 * backend media authorization checks.
 */
export function BuyAccess({
  campaign,
  terms,
  stage,
}: {
  campaign: Address;
  terms: CampaignTerms;
  stage: number;
}) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: ARC_TESTNET.id });
  const writer = useWriteContract();
  const switchChain = useSwitchChain();
  const cache = useQueryClient();
  const flow = useTxFlow();
  const reads = useReadContracts({
    contracts: [
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "hasPaidAccess",
        args: [address ?? zeroAddress],
        chainId: ARC_TESTNET.id,
      },
      {
        address: terms.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address ?? zeroAddress],
        chainId: ARC_TESTNET.id,
      },
      {
        address: terms.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address ?? zeroAddress, campaign],
        chainId: ARC_TESTNET.id,
      },
    ],
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const [paid, balance] = reads.data?.map((read) =>
    read.status === "success" ? (read.result as bigint) : undefined,
  ) ?? [];
  const readsFailed =
    reads.isError || reads.data?.some((read) => read.status === "failure");

  if (stage !== 3) return null;

  // While uncertain, no action resubmits until "Check status again" resolves it.
  const ready =
    !!address && !flow.busy && flow.state !== "uncertain" && !readsFailed;
  const price = terms.watchPrice;
  const insufficient =
    balance !== undefined && balance < price;
  const canBuy =
    ready && !insufficient && balance !== undefined;

  async function purchase() {
    if (!ready || !address || !client || insufficient === true) return;
    // Prompt the wallet to switch before any write when on the wrong network.
    if (chainId !== ARC_TESTNET.id) {
      switchChain.switchChain({ chainId: ARC_TESTNET.id });
      return;
    }
    let submitted = false;
    flow.start("buyAccess", "Confirm the transaction in your wallet.");
    try {
      const allowance = await client.readContract({
        address: terms.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, campaign],
      });
      if (allowance < price) {
        flow.update("Approve test USDC in your wallet.");
        const approval = await client.simulateContract({
          address: terms.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [campaign, price],
          account: address,
        });
        const approvalTx = await writer.writeContractAsync({
          ...approval.request,
          chainId: ARC_TESTNET.id,
        });
        submitted = true;
        const approvalOutcome = await flow.awaitConfirm(approvalTx);
        if (approvalOutcome.outcome !== "confirmed") return;
        submitted = false;
      }
      flow.start("buyAccess", "Confirm the access purchase in your wallet.");
      const simulation = await client.simulateContract({
        address: campaign,
        abi: campaignAbi,
        functionName: "buyAccess",
        account: address,
      });
      const tx: Hash = await writer.writeContractAsync({
        ...simulation.request,
        chainId: ARC_TESTNET.id,
      });
      submitted = true;
      await flow.awaitConfirm(tx, async () => {
        await cache.invalidateQueries();
        return "Access purchased. You can now watch this film.";
      });
    } catch (error) {
      flow.failed(error, submitted);
    }
  }

  const blockedHint = insufficient
      ? `This wallet holds only ${formatUsdc(balance ?? 0n)} test USDC, less than the viewing price.`
      : balance === undefined
        ? "Loading wallet balance…"
        : undefined;

  return (
    <Card>
      <CardHeader className="p-3">
        <CardTitle className="font-dela text-lg uppercase">Watch this film</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        <p>
          Viewing price: {formatUsdc(price)} test USDC — one purchase grants
          this wallet permanent access.
        </p>
        {!address ? (
          <p>Connect your wallet to buy access.</p>
        ) : (
          <>
            {chainId !== ARC_TESTNET.id ? (
              <div className="space-y-2">
                <p>Switch to Arc Testnet to continue.</p>
                <Button
                  disabled={switchChain.isPending}
                  onClick={() => switchChain.switchChain({ chainId: ARC_TESTNET.id })}
                >
                  {switchChain.isPending ? "Switching…" : "Switch to Arc Testnet"}
                </Button>
                {switchChain.error && (
                  <p role="alert">
                    Could not switch networks. Switch in your wallet and try again.
                  </p>
                )}
              </div>
            ) : readsFailed ? (
              <p role="alert">
                Your access status could not be loaded.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void reads.refetch()}
                >
                  Retry
                </button>
              </p>
            ) : paid ? (
              <>
                <p role="status">You have access.</p>
                <p>
                  <Link
                    className="text-[#d3ed05] font-semibold hover:text-[#e4ff1a] underline"
                    href={watchPath(campaign)}
                  >
                    Watch the film
                  </Link>
                </p>
              </>
            ) : (
              <>
                <Button disabled={!canBuy} onClick={() => void purchase()}>
                  {flow.busy
                    ? "Transaction pending…"
                    : `Buy access for ${formatUsdc(price)} test USDC`}
                </Button>
                {blockedHint && <p role="status">{blockedHint}</p>}
              </>
            )}
            <TxStatus
              state={flow.state}
              message={flow.message}
              hash={flow.hash}
              checking={flow.checking}
              checkingAction={() => void flow.checkStatus()}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
