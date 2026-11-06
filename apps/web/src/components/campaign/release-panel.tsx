"use client";

/**
 * Creator-only film release path for a campaign in Production: upload the finished film
 * directly to Mux, wait for the protected asset, select it, then commit its playback hash on
 * Arc. The backend owns every provider call; this panel only moves bytes and mirrors the
 * upload/release state the backend reports.
 */
import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { zeroHash, type Address, type Hex } from "viem";
import { ARC_TESTNET, type CampaignTerms } from "@/lib/chain";
import { campaignAbi } from "@cinevest/abi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TxStatus } from "@/components/ui/tx-status";
import { useSession } from "@/lib/use-session";
import { useTxFlow } from "@/lib/use-tx-flow";

// Mirrors ALLOWED_TYPES and MAX_UPLOAD_BYTES in apps/backend/lib/media/reconcile.ts.
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"] as const;
const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;
const EXTENSION_TYPES: Record<string, (typeof VIDEO_TYPES)[number]> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

type UploadStatus = "pending" | "uploading" | "processing" | "ready" | "failed";
type Upload = {
  id: string;
  attemptKey: string;
  status: UploadStatus;
  stale: boolean;
  uploadUrl: string | null;
};
type Release = {
  selected: boolean;
  playbackIdHash: Hex | null;
  locked: boolean;
  matchesArc: boolean;
};
type ErrorBody = { error?: string; reason?: string; checks?: Record<string, number | null> };

const STATUS_LABELS: Record<UploadStatus, string> = {
  pending: "Starting",
  uploading: "Uploading",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  const body = (await response.json().catch(() => ({}))) as T & ErrorBody;
  return { ok: response.ok, status: response.status, body };
}

/** Browser-to-Mux transfer with real progress; the film never passes through Next.js. */
function putBytes(url: string, file: File, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const transfer = new XMLHttpRequest();
    transfer.open("PUT", url);
    transfer.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    transfer.onload = () =>
      transfer.status >= 200 && transfer.status < 300
        ? resolve()
        : reject(new Error(`The upload was rejected (HTTP ${transfer.status}).`));
    transfer.onerror = () => reject(new Error("The upload connection failed."));
    transfer.onabort = () => reject(new Error("The upload was cancelled."));
    transfer.send(file);
  });
}

function contentType(file: File) {
  if ((VIDEO_TYPES as readonly string[]).includes(file.type)) {
    return file.type as (typeof VIDEO_TYPES)[number];
  }
  return EXTENSION_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""];
}

function isHash(value: Hex | null | undefined): value is Hex {
  return !!value && value !== zeroHash && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/** One stable attempt per campaign and wallet so a reload resumes the same upload. */
function attemptFor(storageKey?: string) {
  if (!storageKey) return crypto.randomUUID();
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) return stored;
    const created = crypto.randomUUID();
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

/** Terminal attempts are dropped so the next file pick starts a fresh upload. */
function clearAttempt(storageKey?: string) {
  if (!storageKey) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* Storage is optional; the attempt key was still usable for this session. */
  }
}

export function ReleasePanel({
  campaign,
  terms,
  stage,
}: {
  campaign: Address;
  terms: CampaignTerms;
  stage: number;
}) {
  const { address, chainId } = useAccount();
  const session = useSession();
  const client = usePublicClient({ chainId: ARC_TESTNET.id });
  const writer = useWriteContract();
  const switchChain = useSwitchChain();
  const cache = useQueryClient();
  const flow = useTxFlow();
  const [release, setRelease] = useState<Release>();
  const [releaseError, setReleaseError] = useState(false);
  const [upload, setUpload] = useState<Upload>();
  const [uploadError, setUploadError] = useState<string>();
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState<number>();
  const [uploading, setUploading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [selectedHash, setSelectedHash] = useState<Hex>();
  const [selectionFailure, setSelectionFailure] = useState<{
    message: string;
    reason?: string;
    checks?: Record<string, number | null>;
  }>();

  const creator = !!address && address.toLowerCase() === terms.creator.toLowerCase();
  const active = creator && stage === 2;
  const storageKey = address
    ? `cinevest.release.attempt.${ARC_TESTNET.id}.${campaign.toLowerCase()}.${address.toLowerCase()}`
    : undefined;

  const loadRelease = useCallback(async () => {
    try {
      const result = await request<Release>(
        `/api/media/release?arcChainId=${ARC_TESTNET.id}&campaignAddress=${campaign}`,
      );
      if (!result.ok) throw new Error();
      setRelease(result.body);
      setReleaseError(false);
    } catch {
      setReleaseError(true);
    }
  }, [campaign]);

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadRelease fetches then sets state
    void loadRelease();
  }, [active, loadRelease]);

  // Bounded status poll: stop on a terminal status, a new upload, or unmount.
  const uploadId = upload?.id;
  const uploadStatus = upload?.status;
  useEffect(() => {
    if (!active || !session.active || !uploadId) return;
    if (uploadStatus === "ready" || uploadStatus === "failed") return;
    let live = true;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      polls += 1;
      try {
        const result = await request<Upload>(`/api/media/uploads/${uploadId}`);
        if (live && result.ok) {
          setUpload(result.body);
          if (result.body.status === "failed") clearAttempt(storageKey);
        }
      } catch {
        /* A transient failure keeps the bounded poll running. */
      }
      if (live && polls < 40) timer = setTimeout(() => void tick(), 3000);
    };
    timer = setTimeout(() => void tick(), 3000);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [active, session.active, uploadId, uploadStatus, storageKey]);

  function pick(selected?: File) {
    setFile(undefined);
    setProgress(undefined);
    setUploadError(undefined);
    if (!selected) return;
    if (!contentType(selected)) {
      setUploadError("Choose an MP4, MOV, WebM or MKV video.");
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setUploadError("The film must be smaller than 2 GiB.");
      return;
    }
    setFile(selected);
  }

  /** Starts or resumes the attempt, then sends the bytes straight to the returned provider URL. */
  async function startUpload() {
    if (!active || !session.active || uploading || selecting || !file) return;
    const type = contentType(file);
    if (!type) return;
    setUploading(true);
    setUploadError(undefined);
    setProgress(undefined);
    try {
      const result = await request<Upload>("/api/media/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          arcChainId: String(ARC_TESTNET.id),
          campaignAddress: campaign,
          attemptKey: attemptFor(storageKey),
          contentType: type,
          sizeBytes: file.size,
        }),
      });
      if (!result.ok) throw new Error(result.body.error ?? "The upload could not be started.");
      setUpload(result.body);
      // Only a failed attempt is retired: a ready upload must stay resumable until selected.
      if (result.body.status === "failed") clearAttempt(storageKey);
      if (result.body.status === "ready" || result.body.status === "failed") return;
      if (!result.body.uploadUrl) return; // Bytes already delivered; the status poll takes over.
      try {
        await putBytes(result.body.uploadUrl, file, setProgress);
        setProgress(1);
      } catch (cause) {
        setUploadError(cause instanceof Error ? cause.message : "The upload failed.");
      }
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : "The upload could not be started.");
    } finally {
      setUploading(false);
    }
  }

  async function refreshStatus() {
    if (!upload?.id || checking) return;
    setChecking(true);
    try {
      const result = await request<Upload>(`/api/media/uploads/${upload.id}`);
      if (!result.ok) throw new Error(result.body.error ?? "Upload status unavailable.");
      setUpload(result.body);
      if (result.body.status === "failed") clearAttempt(storageKey);
    } catch (cause) {
      setUploadError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Upload status unavailable.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function selectForRelease() {
    if (!active || !session.active || uploading || selecting || !upload) return;
    if (upload.status !== "ready" || release?.locked) return;
    setSelecting(true);
    setSelectionFailure(undefined);
    try {
      const result = await request<{ uploadId: string; playbackIdHash: Hex }>(
        "/api/media/release",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            arcChainId: String(ARC_TESTNET.id),
            campaignAddress: campaign,
            uploadId: upload.id,
          }),
        },
      );
      if (!result.ok) {
        setSelectionFailure({
          message: result.body.error ?? "The release selection failed.",
          reason: result.body.reason,
          checks: result.body.checks,
        });
        if (result.status === 409) void loadRelease();
        return;
      }
      setSelectedHash(result.body.playbackIdHash);
      await loadRelease();
    } catch {
      setSelectionFailure({ message: "The release selection is temporarily unavailable." });
    } finally {
      setSelecting(false);
    }
  }

  const hash = [selectedHash, release?.playbackIdHash].find(isHash);
  const canConfigure =
    active &&
    !!client &&
    !flow.busy &&
    !!hash &&
    !!release?.selected &&
    !release.matchesArc &&
    !release.locked;

  async function configureRelease() {
    if (!canConfigure || !address || !client || !isHash(hash)) return;
    // Prompt the wallet to switch before any write when on the wrong network.
    if (chainId !== ARC_TESTNET.id) {
      switchChain.switchChain({ chainId: ARC_TESTNET.id });
      return;
    }
    let submitted = false;
    flow.start("configureRelease", "Confirm the release configuration in your wallet.");
    try {
      const simulation = await client.simulateContract({
        address: campaign,
        abi: campaignAbi,
        functionName: "configureRelease",
        args: [hash],
        account: address,
      });
      const tx = await writer.writeContractAsync({
        ...simulation.request,
        chainId: ARC_TESTNET.id,
      });
      submitted = true;
      await flow.awaitConfirm(tx, async () => {
        await cache.invalidateQueries();
        await loadRelease();
        return "Film release configured on Arc.";
      });
    } catch (error) {
      flow.failed(error, submitted);
    }
  }

  async function publishFilm() {
    if (!active || !address || !client || !release?.matchesArc || flow.busy) return;
    // Prompt the wallet to switch before any write when on the wrong network.
    if (chainId !== ARC_TESTNET.id) {
      switchChain.switchChain({ chainId: ARC_TESTNET.id });
      return;
    }
    let submitted = false;
    flow.start("publishFilm", "Confirm publishing the film in your wallet.");
    try {
      const simulation = await client.simulateContract({
        address: campaign,
        abi: campaignAbi,
        functionName: "publishFilm",
        account: address,
      });
      const tx = await writer.writeContractAsync({
        ...simulation.request,
        chainId: ARC_TESTNET.id,
      });
      submitted = true;
      await flow.awaitConfirm(tx, async () => {
        await cache.invalidateQueries();
        return "Film published. Paid viewing is now open.";
      });
    } catch (error) {
      flow.failed(error, submitted);
    }
  }

  // Release setup is creator-only; other viewers see nothing here.
  if (!address || !creator) return null;
  if (stage !== 2) {
    return (
      <p className="text-xs text-muted-foreground">
        Film release setup unlocks when the campaign reaches the Production stage.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader className="p-3">
        <CardTitle className="font-dela text-lg uppercase">Film release</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        {!session.checked ? (
          <p className="text-xs text-muted-foreground">Checking sign-in…</p>
        ) : !session.active ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Sign in with the campaign creator wallet to upload the film and select the
              release.
            </p>
            <Button disabled={session.busy} onClick={() => void session.signIn()}>
              {session.busy ? "Waiting for signature…" : "Sign in with wallet"}
            </Button>
            {session.error && (
              <p role="alert" className="text-xs text-red-300">
                {session.error}
              </p>
            )}
          </div>
        ) : (
          <>
            {releaseError && (
              <p role="alert" className="text-xs text-red-300">
                Release status unavailable.{" "}
                <button type="button" className="underline" onClick={() => void loadRelease()}>
                  Retry
                </button>
              </p>
            )}
            {release?.locked && (
              <p className="text-xs text-amber-300">
                The release selection is locked after the final milestone approval.
              </p>
            )}
            {release?.selected && (
              <p className="text-xs break-all">
                Selection recorded
                {release.playbackIdHash ? `: ${release.playbackIdHash}` : ""}. Arc
                commitment: {release.matchesArc ? "matches" : "not configured yet"}.
              </p>
            )}

            <div className="space-y-2 rounded-lg border border-white/10 p-3">
              <p className="text-sm font-bold text-white">1. Choose the finished film</p>
              <input
                id="release-film"
                type="file"
                accept={VIDEO_TYPES.join(",")}
                disabled={uploading || selecting || !!release?.locked}
                className="w-full text-xs"
                onChange={(event) => pick(event.target.files?.[0])}
              />
              <p className="text-xs text-muted-foreground">
                MP4, MOV, WebM or MKV, up to 2 GiB and 4 hours. The file goes straight to
                the video provider.
              </p>
              <Button
                disabled={!file || uploading || selecting || !!release?.locked}
                onClick={() => void startUpload()}
              >
                {uploading ? "Uploading…" : uploadError ? "Retry upload" : "Upload film"}
              </Button>
              {progress !== undefined && (
                <p role="status" aria-live="polite" className="text-xs">
                  {progress >= 1
                    ? "Upload sent. Waiting for the provider…"
                    : `Uploading… ${Math.round(progress * 100)}%`}
                </p>
              )}
              {uploadError && (
                <p role="alert" className="text-xs text-red-300">
                  {uploadError}
                </p>
              )}
              {upload && (
                <p role="status" className="text-xs">
                  Upload status: {STATUS_LABELS[upload.status] ?? upload.status}
                  {upload.stale
                    ? " — the provider did not answer; retrying is safe."
                    : ""}
                </p>
              )}
            </div>

            {upload?.status === "ready" && !release?.locked && (
              <Button disabled={selecting} onClick={() => void selectForRelease()}>
                {selecting ? "Working…" : "Select for release"}
              </Button>
            )}
            {selectionFailure && (
              <div
                role="alert"
                className="space-y-1 rounded-md border border-red-300/40 p-2 text-xs break-all text-red-300"
              >
                <p>{selectionFailure.message}</p>
                {selectionFailure.reason && <p>{selectionFailure.reason}</p>}
                {selectionFailure.checks &&
                  Object.keys(selectionFailure.checks).length > 0 && (
                    <ul className="list-disc pl-4">
                      {Object.entries(selectionFailure.checks).map(([name, code]) => (
                        <li key={name}>
                          {name}: {code ?? "no response"}
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            )}

            {hash && (
              <div className="space-y-2 rounded-lg border border-white/10 p-3">
                <p className="text-sm font-bold text-white">
                  2. Configure the release on Arc
                </p>
                <p className="text-xs break-all text-muted-foreground">
                  Playback hash: {hash}
                </p>
                {release?.matchesArc ? (
                  <p role="status" className="text-xs text-[#d3ed05]">
                    Arc holds this playback hash.
                  </p>
                ) : (
                  <>
                    {chainId !== ARC_TESTNET.id && (
                      <p className="text-xs">
                        Switch to Arc Testnet to configure the release.{" "}
                        <button
                          type="button"
                          className="underline"
                          disabled={switchChain.isPending}
                          onClick={() =>
                            switchChain.switchChain({ chainId: ARC_TESTNET.id })
                          }
                        >
                          {switchChain.isPending ? "Switching…" : "Switch now"}
                        </button>
                      </p>
                    )}
                    <Button disabled={!canConfigure} onClick={() => void configureRelease()}>
                      {flow.busy ? "Transaction pending…" : "Configure release on Arc"}
                    </Button>
                  </>
                )}
              </div>
            )}

            {release?.matchesArc && (
              <div className="space-y-2 rounded-lg border border-white/10 p-3">
                <p className="text-sm font-bold text-white">3. Publish the film</p>
                <p className="text-xs text-muted-foreground">
                  Needs all three milestones approved by the reviewer. Publishing opens paid
                  viewing and starts the revenue term.
                </p>
                <Button disabled={flow.busy || flow.state === "uncertain"} onClick={() => void publishFilm()}>
                  {flow.busy ? "Transaction pending…" : "Publish film"}
                </Button>
              </div>
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
