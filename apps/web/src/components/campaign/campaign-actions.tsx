"use client";

import { useState } from "react";
import {
  useAccount,
  useBlock,
  usePublicClient,
  useReadContracts,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  erc20Abi,
  parseEventLogs,
  parseUnits,
  zeroAddress,
  verifyTypedData,
  type Address,
  type Hash,
} from "viem";
import { ARC_TESTNET, type CampaignTerms } from "@/lib/chain";
import { formatUsdc } from "@/lib/format";
import { campaignAbi, worldAuthorizationData, worldAuthorizationDigest, type WorldAuthorizationGrant } from "@cinevest/abi";
import { ARC_TESTNET_DEPLOYMENT } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TxStatus } from "@/components/ui/tx-status";
import { useTxFlow } from "@/lib/use-tx-flow";

export function CampaignActions({
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
  const block = useBlock({
    chainId: ARC_TESTNET.id,
    query: { refetchInterval: 15_000 },
  });
  const [amount, setAmount] = useState("");
  const [worldGrant, setWorldGrant] = useState<WorldAuthorizationGrant>();
  const flow = useTxFlow();
  const publicRound = useReadContract({
    address: campaign, abi: campaignAbi, functionName: "publicFundingOpen",
    chainId: ARC_TESTNET.id, query: { refetchInterval: 15_000 },
  });
  // Older campaigns lack this extension; a failed read preserves their original World gate.
  const requiresWorld = terms.worldGated && publicRound.data !== true;
  const reads = useReadContracts({
    contracts: [
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "raised",
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "contribution",
        args: [address ?? zeroAddress],
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "claimableFunder",
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
        address: campaign,
        abi: campaignAbi,
        functionName: "withdrawableTrancheAmount",
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "creatorAllocated",
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "creatorClaimed",
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "paidTrancheAmount",
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "disputeStatus",
        args: [1n],
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "disputeStatus",
        args: [2n],
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "CANCELLATION_GRACE_PERIOD",
        chainId: ARC_TESTNET.id,
      },
    ],
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const [
    raised,
    contribution,
    claimable,
    balance,
    tranche,
    allocated,
    claimed,
    paidTranche,
  ] =
    reads.data?.map((read) =>
      read.status === "success" ? (read.result as bigint) : undefined,
    ) ?? [];
  const readsFailed =
    reads.isError || reads.data?.some((read) => read.status === "failure");
  // While uncertain, no action resubmits until "Check status again" resolves it.
  const ready =
    ARC_TESTNET_DEPLOYMENT.compatible && !!address && !flow.busy && flow.state !== "uncertain" && !readsFailed;
  const creator = address?.toLowerCase() === terms.creator.toLowerCase();
  const reviewer = address?.toLowerCase() === terms.reviewer.toLowerCase();
  // Both claim amounts are cumulative-supply minus cumulative-withdrawn, clamped to zero.
  const creatorDue =
    allocated !== undefined && claimed !== undefined
      ? allocated > claimed
        ? allocated - claimed
        : 0n
      : undefined;
  const trancheClaimable =
    tranche !== undefined && paidTranche !== undefined
      ? tranche > paidTranche
        ? tranche - paidTranche
        : 0n
      : undefined;
  // DisputeStatus.Pending (index 1 or 2) freezes tranche claims on-chain.
  const disputeAt = (position: number) => {
    const read = reads.data?.[position];
    return read?.status === "success" ? (read.result as number) : undefined;
  };
  const dispute1 = disputeAt(8);
  const dispute2 = disputeAt(9);
  const disputePending = dispute1 === 1 || dispute2 === 1;
  const graceRead = reads.data?.[10];
  const gracePeriod =
    graceRead?.status === "success" ? (graceRead.result as bigint) : undefined;
  // cancelProduction: the reviewer may cancel once the deadline passes; anyone
  // else waits out the on-chain grace period (7 days).
  const now =
    block.data !== undefined ? BigInt(block.data.timestamp) : undefined;
  const productionDeadlinePassed =
    now !== undefined && now >= terms.productionDeadline;
  const gracePassed =
    productionDeadlinePassed &&
    gracePeriod !== undefined &&
    now >= terms.productionDeadline + gracePeriod;
  const canCancelProduction =
    stage === 2 && productionDeadlinePassed && (reviewer || gracePassed);
  const cancelHint =
    !productionDeadlinePassed
      ? "Cancellation unlocks when the production deadline passes."
      : !reviewer && !gracePassed
        ? "Only the configured reviewer can cancel while the seven-day grace period after the deadline runs; anyone can cancel afterwards."
        : "Cancelling returns each contributor's pro-rata share of unspent production escrow.";
  const trancheHint = () => {
    if (!creator)
      return "Only the campaign creator can claim production funds.";
    if (![2, 3].includes(stage))
      return "Production funds unlock when the campaign reaches the Production stage.";
    if (disputePending)
      return "A milestone dispute is pending; claims stay frozen until the reviewer resolves it.";
    if (trancheClaimable === undefined)
      return "Loading available production funds…";
    if (trancheClaimable === 0n)
      return "No approved production funds are claimable yet.";
    return `Available production funds: ${formatUsdc(trancheClaimable)} test USDC.`;
  };
  const revenueHint = () => {
    if (!creator) return "Only the campaign creator can claim viewing revenue.";
    if (creatorDue === undefined) return "Loading creator viewing receipts…";
    if (creatorDue === 0n)
      return "No creator viewing receipts yet; they accrue from paid viewers after release.";
    return `Available creator receipts: ${formatUsdc(creatorDue)} test USDC.`;
  };
  let units = 0n;
  if (/^\d{1,78}(\.\d{1,6})?$/.test(amount)) {
    try {
      units = parseUnits(amount, 6);
    } catch {
      /* Invalid amounts remain disabled. */
    }
  }
  const worldReady = Boolean(worldGrant && worldGrant.chainId === ARC_TESTNET.id
    && worldGrant.authorization.wallet.toLowerCase() === address?.toLowerCase()
    && worldGrant.authorization.campaign.toLowerCase() === campaign.toLowerCase()
    && block.data && BigInt(worldGrant.authorization.deadline) > block.data.timestamp);
  const canFund =
    ready &&
    stage === 0 &&
    (!requiresWorld || worldReady) &&
    units > 0n &&
    raised !== undefined &&
    units <= terms.fundingGoal - raised &&
    balance !== undefined &&
    units <= balance &&
    block.data !== undefined &&
    BigInt(block.data.timestamp) < terms.fundingDeadline;
  const deadlinePassed =
    stage === 0 &&
    block.data !== undefined &&
    BigInt(block.data.timestamp) >= terms.fundingDeadline;

  async function transact(
    action:
      | "contribute"
      | "claimFundingRefund"
      | "claimCancelledEscrow"
      | "cancelProduction"
      | "claimFunderRevenue"
      | "claimCreatorRevenue"
      | "claimApprovedTranche"
      | "finalize"
      | "expire",
  ) {
    if (!ready || !address || !client) return;
    // Prompt the wallet to switch before any write when on the wrong network.
    if (chainId !== ARC_TESTNET.id) {
      switchChain.switchChain({ chainId: ARC_TESTNET.id });
      return;
    }
    let submitted = false;
    flow.start(action, "Confirm the transaction in your wallet.");
    try {
      if (action === "contribute") {
        if (
          !canFund ||
          BigInt(Math.floor(Date.now() / 1000)) >= terms.fundingDeadline
        )
          throw new Error("Funding is closed or the amount is invalid.");
        if (requiresWorld) {
          if (!worldGrant || !worldReady) throw new Error("Verify with World ID before funding.");
          const authorization = { ...worldGrant.authorization, deadline: BigInt(worldGrant.authorization.deadline) };
          const signer = await client.readContract({ address: campaign, abi: campaignAbi, functionName: "worldVerifierSigner" });
          if (worldGrant.digest !== worldAuthorizationDigest(ARC_TESTNET.id, authorization)
              || !await verifyTypedData({ ...worldAuthorizationData(ARC_TESTNET.id, authorization), address: signer, signature: worldGrant.signature })) {
            throw new Error("World funding permission is invalid. Verify again.");
          }
          const [used, owner, funded] = await Promise.all([
            client.readContract({ address: campaign, abi: campaignAbi, functionName: "usedWorldAuthorizations", args: [worldGrant.digest] }),
            client.readContract({ address: campaign, abi: campaignAbi, functionName: "nullifierOwner", args: [authorization.scopedNullifierHash] }),
            client.readContract({ address: campaign, abi: campaignAbi, functionName: "humanContribution", args: [authorization.scopedNullifierHash] }),
          ]);
          if (authorization.deadline <= BigInt(Math.floor(Date.now() / 1000)) || used
              || (owner !== zeroAddress && owner.toLowerCase() !== address.toLowerCase()) || funded + units > terms.perHumanLimit) {
            throw new Error("World permission expired, used or human limit exceeded. Verify again if eligible.");
          }
        }
        const allowance = await client.readContract({
          address: terms.usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, campaign],
        });
        if (allowance < units) {
          flow.update("Approve test USDC in your wallet.");
          const approval = await client.simulateContract({
            address: terms.usdc,
            abi: erc20Abi,
            functionName: "approve",
            args: [campaign, units],
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
        flow.start(action, "Confirm the contribution in your wallet.");
      }
      let tx: Hash;
      if (action === "contribute") {
        if (requiresWorld && (!worldGrant || !worldReady
            || BigInt(worldGrant.authorization.deadline) <= BigInt(Math.floor(Date.now() / 1000)))) {
          setWorldGrant(undefined);
          throw new Error("World funding permission expired. Verify again.");
        }
        if (requiresWorld && worldGrant) {
          const simulation = await client.simulateContract({ address: campaign, abi: campaignAbi, functionName: "contributeWithAuthorization",
            args: [units, { ...worldGrant.authorization, deadline: BigInt(worldGrant.authorization.deadline) }, worldGrant.signature], account: address });
          tx = await writer.writeContractAsync({ ...simulation.request, chainId: ARC_TESTNET.id });
        } else {
          const simulation = await client.simulateContract({ address: campaign, abi: campaignAbi, functionName: "contribute", args: [units], account: address });
          tx = await writer.writeContractAsync({ ...simulation.request, chainId: ARC_TESTNET.id });
        }
      } else {
        const simulation = await client.simulateContract({
          address: campaign,
          abi: campaignAbi,
          functionName: action,
          account: address,
        });
        tx = await writer.writeContractAsync({
          ...simulation.request,
          chainId: ARC_TESTNET.id,
        });
      }
      submitted = true;
      await flow.awaitConfirm(tx, async (receipt) => {
        const payment = parseEventLogs({
          abi: campaignAbi,
          eventName: "ClaimPaid",
          logs: receipt.logs.filter(
            (log) => log.address.toLowerCase() === campaign.toLowerCase(),
          ),
        }).find(
          (event) => event.args.claimant.toLowerCase() === address.toLowerCase(),
        );
        if (action === "contribute" && terms.worldGated) setWorldGrant(undefined);
        await cache.invalidateQueries();
        if (payment)
          return `Claim confirmed: ${formatUsdc(payment.args.amount)} test USDC paid.`;
      });
    } catch (error) {
      flow.failed(error, submitted);
    }
  }

  return (
    <Card>
      <CardHeader className="p-3">
        <CardTitle className="font-dela text-lg uppercase">Funding and claims</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        {!address ? (
          <p>Connect your wallet to contribute or claim funds.</p>
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
        ) : readsFailed || block.isError ? (
          <p role="alert">
            Some balances could not be loaded.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                void reads.refetch();
                void block.refetch();
              }}
            >
              Retry
            </button>
          </p>
        ) : null}
        {stage === 0 && (
          <div className="space-y-2">
            <label htmlFor="contribution-amount" className="block text-sm">
              Contribution (test USDC)
            </label>
            <input
              id="contribution-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-h-11 w-full rounded-md border border-white/15 bg-[#072733] px-3 text-white"
            />

            <Button
              disabled={!canFund}
              onClick={() => void transact("contribute")}
            >
              {flow.busy ? "Transaction pending…" : "Approve and contribute"}
            </Button>
            {requiresWorld && (
              <p>
                {worldReady ? "World ID permission ready. The contract enforces your cumulative human limit."
                  : "This legacy campaign has an immutable World gate. World verification is retired; use a new campaign with public funding."}
              </p>
            )}
            {deadlinePassed && (
              <p role="status">
                The funding deadline has passed; the campaign can be expired or
                finalized below, but not funded.
              </p>
            )}
            {!deadlinePassed &&
              balance !== undefined &&
              units > 0n &&
              units > balance && (
                <p role="status">
                  This wallet holds only {formatUsdc(balance)} test USDC, less
                  than the entered contribution.
                </p>
              )}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {stage === 0 && (
            <>
              <Button
                disabled={!ready || raised !== terms.fundingGoal}
                onClick={() => void transact("finalize")}
              >
                Finalize successful funding
              </Button>
              <Button
                disabled={
                  !ready ||
                  raised === undefined ||
                  raised >= terms.fundingGoal ||
                  !block.data ||
                  BigInt(block.data.timestamp) < terms.fundingDeadline
                }
                onClick={() => void transact("expire")}
              >
                Close failed funding
              </Button>
            </>
          )}
          {(stage === 1 || stage === 4) && (
            <>
              <Button
                disabled={!ready || contribution === undefined || contribution <= 0n}
                onClick={() =>
                  void transact(stage === 4 ? "claimCancelledEscrow" : "claimFundingRefund")
                }
              >
                {stage === 4 ? "Claim cancelled escrow" : "Claim funding refund"}
              </Button>
              {contribution === 0n && (
                <p role="status">
                  This wallet has no contribution to refund.
                </p>
              )}
            </>
          )}
          {stage === 2 && (
            <Button
              disabled={!ready || !canCancelProduction}
              onClick={() => void transact("cancelProduction")}
            >
              Cancel production
            </Button>
          )}
          {stage === 2 && productionDeadlinePassed && (
            <p role="status">{cancelHint}</p>
          )}
          <Button
            disabled={!ready || claimable === undefined || claimable <= 0n}
            onClick={() => void transact("claimFunderRevenue")}
          >
            Claim backer receipts
          </Button>
          <Button
            disabled={
              !ready ||
              !creator ||
              ![2, 3].includes(stage) ||
              disputePending ||
              trancheClaimable === undefined ||
              trancheClaimable <= 0n
            }
            onClick={() => void transact("claimApprovedTranche")}
          >
            Claim production tranche
          </Button>
          <Button
            disabled={
              !ready || !creator || creatorDue === undefined || creatorDue <= 0n
            }
            onClick={() => void transact("claimCreatorRevenue")}
          >
            Claim creator receipts
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Claims require an eligible stage and an available balance.{" "}
          {claimable === undefined
            ? "Loading backer receipts…"
            : claimable > 0n
              ? `Available backer receipts: ${formatUsdc(claimable)} test USDC.`
              : "No backer receipts are claimable for this wallet yet; they accrue after release."}
        </p>
        <p className="text-xs text-muted-foreground">
          {trancheHint()} {revenueHint()}
        </p>
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
