"use client";
/**
 * Final-delivery release gate (spec P8.7b): a client recheck of the selected film release
 * against the media backend before the reviewer may approve milestone index 2. The result is
 * trusted off-chain evidence only; the reviewer remains free to reject.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { type Address } from "viem";
import { ARC_TESTNET } from "@/lib/chain";
import { Button } from "@/components/ui/button";
import type { ReviewReport } from "../../../../../cre/protocol";
import { useSession } from "@/lib/use-session";

export type ReleaseGateStatusName =
  | "idle"
  | "signed-out"
  | "checking"
  | "passed"
  | "failed"
  | "unavailable";

export type ReleaseGateCheckKey =
  | "selected"
  | "providerReady"
  | "nonpublicPolicy"
  | "hashMatchesArc"
  | "playbackProtected"
  | "creReady";

export type ReleaseGateState = {
  status: ReleaseGateStatusName;
  checks: Partial<Record<ReleaseGateCheckKey, boolean>>;
  reason?: string;
  cre?: ReviewReport;
};

type VerifyResponse = { ok?: boolean; reason?: string; checks?: Record<string, boolean>; cre?: ReleaseGateState["cre"] };

const CHECK_LABELS: Array<{ key: ReleaseGateCheckKey; label: string }> = [
  { key: "selected", label: "A film release asset is selected" },
  { key: "providerReady", label: "Provider asset is ready" },
  { key: "nonpublicPolicy", label: "Playback policy is not public" },
  { key: "hashMatchesArc", label: "Playback hash matches Arc" },
  { key: "playbackProtected", label: "Test playback stayed protected" },
  { key: "creReady", label: "Chainlink CRE checked Arc and Mux" },
];

export function useReleaseGate(campaign: Address, enabled: boolean) {
  const [state, setState] = useState<ReleaseGateState & { campaign?: Address }>({ status: "idle", checks: {} });
  const enabledRef = useRef(false);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const pendingRef = useRef<Promise<ReleaseGateState> | undefined>(undefined);

  const run = useCallback((): Promise<ReleaseGateState> => {
    if (!enabledRef.current) return Promise.resolve({ status: "idle", checks: {} });
    if (pendingRef.current) return pendingRef.current;
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const finish = (next: ReleaseGateState): ReleaseGateState => {
      if (!enabledRef.current || generation !== generationRef.current) return { status: "idle", checks: {} };
      pendingRef.current = undefined;
      setState({ ...next, campaign });
      return next;
    };
    setState({ status: "checking", checks: {}, campaign });
    const poll = (async () => {
      try {
        const response = await fetch(
          `/api/media/release/verify?arcChainId=${ARC_TESTNET.id}&campaignAddress=${campaign}`,
          { credentials: "same-origin", cache: "no-store", signal: controller.signal },
        );
        if (response.status === 401) return finish({ status: "signed-out", checks: {} });
        if (!response.ok) return finish({ status: "unavailable", checks: {},
          reason: "CRE release review is unavailable. Check your wallet session and runner setup, then retry." });
        const data = await response.json() as VerifyResponse;
        const report = data.cre;
        if (!data.ok || data.checks?.creReady !== true || !report?.ready
          || report.execution !== "cre-cli-simulation" || report.campaign.toLowerCase() !== campaign.toLowerCase()
          || report.expiresAt * 1000 <= Date.now()) {
          return finish({ status: "failed", checks: data.checks ?? {}, cre: report,
            reason: data.reason ?? "CRE release conditions did not pass." });
        }
        return finish({ status: "passed", checks: data.checks ?? {}, cre: report });
      } catch {
        return finish({ status: "unavailable", checks: {}, reason: "The CRE release check could not be reached." });
      }
    })();
    pendingRef.current = poll;
    return poll;
  }, [campaign]);

  useEffect(() => {
    enabledRef.current = enabled;
    const generation = generationRef.current;
    if (enabled) queueMicrotask(() => {
      if (enabledRef.current && generation === generationRef.current) void run();
    });
    return () => {
      enabledRef.current = false;
      generationRef.current += 1;
      controllerRef.current?.abort();
      pendingRef.current = undefined;
    };
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled || state.status !== "passed" || !state.cre) return;
    const requestId = state.cre.requestId;
    const timer = setTimeout(() => setState(current =>
      current.status === "passed" && current.cre?.requestId === requestId
        ? { ...current, status: "failed", reason: "CRE review expired. Recheck before approval." }
        : current), Math.max(0, state.cre.expiresAt * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [enabled, state.status, state.cre]);

  const visible = enabled && state.campaign === campaign ? state : { status: "idle" as const, checks: {}, cre: undefined, reason: undefined };
  return { ...visible, recheck: run };
}

export function ReleaseGateStatus({ gate }: { gate: ReturnType<typeof useReleaseGate> }) {
  const session = useSession();
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <p className="text-sm font-bold text-white">Chainlink CRE release gate</p>
      <ul className="space-y-1">
        {CHECK_LABELS.map(({ key, label }) => (
          <li key={key} className="flex items-center gap-2 text-xs">
            <span aria-hidden className="w-3 text-center">
              {gate.checks[key] === true ? "✓" : gate.checks[key] === false ? "✕" : "·"}
            </span>
            <span className={gate.checks[key] === false ? "text-red-300" : "text-white/80"}>
              {label}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-300">
        CRE CLI simulation with live Arc and Mux reads. Human reviewers retain approval authority; this is not a production oracle.
      </p>
      {gate.cre && <details className="text-xs text-white/70">
        <summary>CRE review report</summary>
        <p>Arc block: {gate.cre.blockNumber}</p>
        <p>Execution: {gate.cre.execution}</p>
        <button type="button" className="underline" onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(gate.cre, null, 2)], { type: "application/json" }));
          const link = document.createElement("a");
          link.href = url; link.download = "cinevest-cre-review.json"; link.click(); URL.revokeObjectURL(url);
        }}>Download redacted CRE report</button>
        <ul>{Object.entries(gate.cre.checks).map(([key, passed]) => <li key={key}>{passed ? "✓" : "✕"} {key}</li>)}</ul>
      </details>}
      {(gate.status === "failed" || gate.status === "unavailable") && gate.reason && (
        <p role="alert" className="text-xs text-amber-300">
          {gate.reason}
        </p>
      )}
      {gate.status === "checking" && (
        <p role="status" className="text-xs text-white/60">
          Rechecking the film release…
        </p>
      )}
      {gate.status === "signed-out" && (
        <p className="text-xs text-white/60">
          Sign in with your wallet to run the release check.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {gate.status !== "signed-out" && (
          <Button
            type="button"
            disabled={gate.status === "checking"}
            onClick={() => void gate.recheck()}
          >
            {gate.status === "checking" ? "Rechecking…" : "Recheck"}
          </Button>
        )}
        {gate.status === "signed-out" && (
          <Button
            type="button"
            disabled={session.busy}
            onClick={() => void session.signIn().then(() => gate.recheck())}
          >
            {session.busy ? "Waiting for signature…" : "Sign in with wallet"}
          </Button>
        )}
      </div>
      {session.error && <p role="alert" className="text-xs">{session.error}</p>}
    </div>
  );
}
