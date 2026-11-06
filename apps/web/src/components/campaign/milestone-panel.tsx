"use client";
import { useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ReleaseGateStatus, useReleaseGate } from "@/components/campaign/release-gate";
import { TxStatus } from "@/components/ui/tx-status";
import { useTxFlow } from "@/lib/use-tx-flow";
import { SignInRequiredError, useAuthedPost } from "@/lib/use-authed-post";
import { posterUrl } from "@/lib/market";
import { MAX_POSTER_UI_BYTES, POSTER_TYPES, posterPayload } from "@/lib/proposal";

const MAX_EVIDENCE_FILES = 3;

type EvidenceManifest = { text: string; evidenceFiles: string[]; submittedAt: number };

/** Public evidence, fetched through the backend, which checks it against the Arc commitment. */
function EvidenceView({
  campaign,
  index,
  reference,
}: {
  campaign: Address;
  index: number;
  reference: Hex;
}) {
  const manifest = useQuery({
    queryKey: ["evidence", campaign, index, reference],
    queryFn: async () => {
      const response = await fetch(
        `/api/swarm/${reference}?kind=milestone&campaign=${campaign}&index=${index}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("unverified");
      return ((await response.json()) as { manifest: EvidenceManifest }).manifest;
    },
  });
  if (manifest.isPending)
    return <p className="text-xs text-white/60">Verifying evidence from Swarm…</p>;
  if (manifest.isError)
    return (
      <p role="alert" className="text-xs text-amber-300">
        The evidence could not be verified from Swarm right now.{" "}
        <button type="button" className="underline" onClick={() => void manifest.refetch()}>
          Try again
        </button>
      </p>
    );
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <p className="text-xs text-[#d3ed05]">Verified against the Arc commitment</p>
      <p className="text-sm whitespace-pre-wrap text-white/80">{manifest.data.text}</p>
      <div className="flex flex-wrap gap-2">
        {manifest.data.evidenceFiles.map((file) => (
          // Verified Swarm bytes served by the backend; next/image cannot optimize this URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={file}
            src={posterUrl(file)}
            alt="Evidence"
            loading="lazy"
            className="h-24 w-auto rounded-md bg-[#072733] object-cover"
          />
        ))}
      </div>
    </div>
  );
}

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
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [upload, setUpload] = useState({ busy: false, message: "" });
  const { post } = useAuthedPost();
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
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "approvedTrancheAmount",
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "trancheAmounts",
        chainId: ARC_TESTNET.id,
      },
      {
        address: campaign,
        abi: campaignAbi,
        functionName: "livepeerPlaybackIdHash",
        chainId: ARC_TESTNET.id,
      },
    ],
    query: { refetchInterval: 15_000 },
  });
  const evidence = reads.data?.[0].result;
  const dispute = reads.data?.[1].result;
  const contribution = reads.data?.[2].result;
  const approvedAmount = reads.data?.[3].result as bigint | undefined;
  const tranches = reads.data?.[4].result as readonly bigint[] | undefined;
  const playbackHash = reads.data?.[5].result as Hex | undefined;
  // Final delivery (index 2) opens only after the rough cut is approved and a release is configured.
  const roughCutApproved =
    approvedAmount !== undefined &&
    tranches !== undefined &&
    approvedAmount >= tranches[0] + tranches[1];
  const releaseConfigured = !!playbackHash && playbackHash !== zeroHash;
  const finalBlockedMessage =
    index !== 2
      ? undefined
      : !roughCutApproved
        ? "Approve the rough cut first: the final delivery opens only after that approval."
        : !releaseConfigured
          ? "Final approval also needs a configured film release, which arrives with the Livepeer step."
          : undefined;
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
  // Release gate (trusted off-chain evidence) runs for the reviewer on final delivery only.
  const gate = useReleaseGate(
    campaign,
    reviewer && stage === 2 && index === 2 && !finalBlockedMessage,
  );
  const [releaseBlock, setReleaseBlock] = useState<string>();

  /** Uploads each image, then the signed milestone manifest; the result becomes the evidence reference. */
  async function uploadEvidence() {
    if (!address || upload.busy) return;
    setUpload({ busy: true, message: "Uploading the evidence images…" });
    try {
      const refs: string[] = [];
      for (const file of evidenceFiles) {
        const res = await post<{ reference?: string; error?: string }>(
          "/api/artifacts",
          { action: "artifact-upload", actor: address, kind: "poster", payload: await posterPayload(file) },
        );
        if (!res.ok || !res.data.reference)
          throw new Error(res.data.error ?? "An evidence image could not be uploaded.");
        refs.push(res.data.reference);
      }
      setUpload({ busy: true, message: "Publishing the milestone manifest…" });
      const manifest = await post<{ reference?: string; error?: string }>(
        "/api/artifacts",
        {
          action: "artifact-upload",
          actor: address,
          kind: "milestone",
          payload: {
            campaignAddress: campaign,
            milestoneIndex: index,
            evidenceFiles: refs,
            submittedAt: Math.floor(Date.now() / 1000),
            text: evidenceText.trim(),
          },
        },
      );
      if (!manifest.ok || !manifest.data.reference)
        throw new Error("The evidence manifest was refused. Only the campaign creator can publish it during Production.");
      setReference(manifest.data.reference);
      setUpload({ busy: false, message: `Evidence published. Reference: ${manifest.data.reference}` });
    } catch (cause) {
      setUpload({
        busy: false,
        message: cause instanceof Error || cause instanceof SignInRequiredError ? cause.message : "Evidence upload failed.",
      });
    }
  }

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
    // Final delivery must pass the release gate again right before the approval is sent.
    if (action === "approveStage" && index === 2) {
      setReleaseBlock(undefined);
      const outcome = await gate.recheck(true);
      if (outcome.status !== "passed") {
        setReleaseBlock(
          outcome.reason ??
            "The film release did not pass the final-delivery checks, so the approval was not sent.",
        );
        return;
      }
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
          {evidence && evidence !== zeroHash && (
            <EvidenceView campaign={campaign} index={index} reference={evidence} />
          )}
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
            <div className="space-y-2 rounded-lg border border-white/10 p-3">
              <p className="text-sm font-bold text-white">Publish evidence to Swarm</p>
              <label htmlFor="evidence-text" className="block text-xs">
                What was delivered
              </label>
              <textarea
                id="evidence-text"
                rows={3}
                className="w-full rounded-md border border-white/15 bg-[#072733] px-3 py-2 text-white"
                value={evidenceText}
                onChange={(event) => setEvidenceText(event.target.value)}
              />
              <label htmlFor="evidence-files" className="block text-xs">
                Evidence images (1 to {MAX_EVIDENCE_FILES}; JPEG, PNG, WebP or GIF, up to 1 MiB each)
              </label>
              <input
                id="evidence-files"
                type="file"
                multiple
                accept={POSTER_TYPES.join(",")}
                className="w-full text-xs"
                onChange={(event) =>
                  setEvidenceFiles(Array.from(event.target.files ?? []))
                }
              />
              <Button
                type="button"
                disabled={
                  !address ||
                  upload.busy ||
                  stage !== 2 ||
                  !evidenceText.trim() ||
                  evidenceFiles.length < 1 ||
                  evidenceFiles.length > MAX_EVIDENCE_FILES ||
                  evidenceFiles.some(
                    (file) =>
                      !POSTER_TYPES.includes(file.type) ||
                      file.size > MAX_POSTER_UI_BYTES,
                  )
                }
                onClick={() => void uploadEvidence()}
              >
                {upload.busy ? "Uploading…" : "Upload evidence to Swarm"}
              </Button>
              {upload.message && (
                <p role="status" aria-live="polite" className="text-xs break-all">
                  {upload.message}
                </p>
              )}
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
          {reviewer && finalBlockedMessage && (
            <p className="text-xs text-amber-300">{finalBlockedMessage}</p>
          )}
          {reviewer && stage === 2 && index === 2 && !finalBlockedMessage && (
            <ReleaseGateStatus gate={gate} />
          )}
          <div className="flex flex-wrap gap-3">
            {reviewer && (
              <>
                <Button
                  disabled={
                    !ready ||
                    !evidence ||
                    evidence === zeroHash ||
                    dispute === 1 ||
                    !!finalBlockedMessage ||
                    (index === 2 && gate.status !== "passed")
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
          {index === 2 && releaseBlock && (
            <p role="alert" className="text-xs text-red-300">
              {releaseBlock}
            </p>
          )}
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
