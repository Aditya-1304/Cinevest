"use client";
import { useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  zeroHash,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { ARC_TESTNET, type CampaignTerms } from "@/lib/chain";
import { campaignAbi } from "@cinevest/abi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TxStatus } from "@/components/ui/tx-status";
import { useTxFlow } from "@/lib/use-tx-flow";

export function MilestonePanel({
  campaign,
  terms,
  stage,
}: {
  campaign: Address;
  terms: CampaignTerms;
  stage: number;
}) {
  const [index, setIndex] = useState(1);
  const [reference, setReference] = useState("");
  const [toastOpen, setToastOpen] = useState(false);
  const flow = useTxFlow();
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: ARC_TESTNET.id });
  const writer = useWriteContract();
  const switchChain = useSwitchChain();
  const cache = useQueryClient();
  const reads = useReadContracts({
    contracts: [
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "evidenceReference",
        args: [BigInt(index)],
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "disputeStatus",
        args: [BigInt(index)],
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "contribution",
        args: [address ?? zeroAddress],
        chainId: ARC_TESTNET.id,
      },
    ],
    query: { refetchInterval: 15_000 },
  });
  const evidence = reads.data?.[0].result;
  const dispute = reads.data?.[1].result;
  const contribution = reads.data?.[2].result;
  const readsFailed =
    reads.isError || reads.data?.some((read) => read.status === "failure");
  const ready =
    !!address &&
    stage === 2 &&
    !flow.busy &&
    flow.state !== "uncertain" &&
    !readsFailed &&
    evidence !== undefined &&
    dispute !== undefined;
  const creator = address?.toLowerCase() === terms.creator.toLowerCase();
  const reviewer = address?.toLowerCase() === terms.reviewer.toLowerCase();

  async function act(
    action: "submitEvidence" | "approveStage" | "disputeStage" | "resolveStage",
    decision = false,
  ) {
    if (!ready || !address || !client || evidence === undefined) return;
    // Prompt the wallet to switch before any write when on the wrong network.
    if (chainId !== ARC_TESTNET.id) {
      switchChain.switchChain({ chainId: ARC_TESTNET.id });
      return;
    }
    setToastOpen(false);
    let submitted = false;
    flow.start(action, "Confirm the milestone transaction in your wallet.");
    try {
      let hash: Hex;
      if (action === "submitEvidence") {
        if (!/^0x[0-9a-fA-F]{64}$/.test(reference) || reference === zeroHash)
          throw new Error();
        const simulation = await client.simulateContract({
          address: campaign,
          abi: campaignAbi,
          functionName: action,
          args: [index, reference as Hex],
          account: address,
        });
        hash = await writer.writeContractAsync({
          ...simulation.request,
          chainId: ARC_TESTNET.id,
        });
      } else if (action === "resolveStage") {
        const simulation = await client.simulateContract({
          address: campaign,
          abi: campaignAbi,
          functionName: action,
          args: [index, evidence, decision],
          account: address,
        });
        hash = await writer.writeContractAsync({
          ...simulation.request,
          chainId: ARC_TESTNET.id,
        });
      } else {
        const simulation = await client.simulateContract({
          address: campaign,
          abi: campaignAbi,
          functionName: action,
          args: [index, evidence],
          account: address,
        });
        hash = await writer.writeContractAsync({
          ...simulation.request,
          chainId: ARC_TESTNET.id,
        });
      }
      submitted = true;
      const result = await flow.awaitConfirm(hash, async () => {
        await cache.invalidateQueries();
      });
      if (result.outcome !== "confirmed") setToastOpen(true);
    } catch (cause) {
      flow.failed(cause, submitted);
      setToastOpen(true);
    }
  }
  return (
    <>
      <Card>
        <CardHeader className="p-3">
          <CardTitle className="font-dela text-lg uppercase">
            Evidence and milestone review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-3 pb-3">
          <select
            aria-label="Production milestone"
            className="min-h-11 w-full rounded-md border border-white/15 bg-[#072733] px-3 text-white"
            value={String(index)}
            onChange={(event) => setIndex(Number(event.target.value))}
          >
            <option value="1">Rough cut · 30%</option>
            <option value="2">Final delivery · 30%</option>
          </select>
          <p className="text-sm break-all">
            Evidence: {evidence ?? "Loading…"}
          </p>
          <p>
            Review:{" "}
            {dispute === undefined
              ? "Loading…"
              : [
                  "No dispute",
                  "Disputed",
                  "Dispute upheld",
                  "Dispute rejected",
                ][dispute]}
          </p>
          {stage !== 2 && (
            <p className="text-xs text-muted-foreground">
              Milestone actions unlock when the campaign reaches the Production
              stage.
            </p>
          )}
          {address && !creator && !reviewer && (
            <p className="text-xs text-muted-foreground">
              Evidence is submitted by the campaign creator; approval and
              dispute resolution belong to the configured reviewer.
            </p>
          )}
          {address &&
            !creator &&
            contribution !== undefined &&
            contribution <= 0n && (
              <p className="text-xs text-muted-foreground">
                Only original contributors can open a dispute.
              </p>
            )}
          {readsFailed && (
            <p role="alert">
              Milestone data unavailable.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void reads.refetch()}
              >
                Retry
              </button>
            </p>
          )}
          {address && chainId !== ARC_TESTNET.id && (
            <p>
              Switch to Arc Testnet to submit or review milestones.{" "}
              <button
                className="underline"
                disabled={switchChain.isPending}
                onClick={() => switchChain.switchChain({ chainId: ARC_TESTNET.id })}
              >
                {switchChain.isPending ? "Switching…" : "Switch now"}
              </button>
            </p>
          )}
          {creator && (
            <div className="space-y-2">
              <label htmlFor="evidence-reference" className="block text-sm">
                Swarm evidence reference (0x plus 64 hex characters)
              </label>
              <input
                id="evidence-reference"
                className="min-h-11 w-full rounded-md border border-white/15 bg-[#072733] px-3 text-white"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
              <Button
                disabled={
                  !ready ||
                  dispute === 1 ||
                  !/^0x[0-9a-fA-F]{64}$/.test(reference) ||
                  reference === zeroHash
                }
                onClick={() => void act("submitEvidence")}
              >
                Submit evidence
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {reviewer && (
              <>
                <Button
                  disabled={
                    !ready ||
                    !evidence ||
                    evidence === zeroHash ||
                    dispute === 1
                  }
                  onClick={() => void act("approveStage")}
                >
                  Approve evidence
                </Button>
                <Button
                  disabled={!ready || dispute !== 1}
                  onClick={() => void act("resolveStage", true)}
                >
                  Uphold dispute
                </Button>
                <Button
                  disabled={!ready || dispute !== 1}
                  onClick={() => void act("resolveStage", false)}
                >
                  Reject dispute
                </Button>
              </>
            )}
            {contribution !== undefined && contribution > 0n && (
              <Button
                disabled={
                  !ready || !evidence || evidence === zeroHash || dispute === 1
                }
                onClick={() => void act("disputeStage")}
              >
                Dispute evidence
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Milestone actions require Production stage, the authorized wallet
            and valid evidence. Final approval also requires a configured film
            release.
          </p>
          <TxStatus
            state={flow.state}
            message={flow.message}
            hash={flow.hash}
            checking={flow.checking}
            checkingAction={() => void flow.checkStatus()}
          />
        </CardContent>
      </Card>
      {toastOpen && (
        <div
          role="status"
          className="border-white/10 bg-[#04141C] text-white fixed right-4 bottom-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg border p-4 shadow-lg"
        >
          <p className="font-semibold">Milestone transaction</p>
          <p className="text-white/70 text-sm">{flow.message}</p>
          <button
            type="button"
            className="text-[#d3ed05] hover:text-[#e4ff1a] mt-2 text-sm font-bold underline"
            aria-label="Dismiss notification"
            onClick={() => setToastOpen(false)}
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
