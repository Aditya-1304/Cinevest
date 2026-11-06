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
  | "playbackProtected";

export type ReleaseGateState = {
  status: ReleaseGateStatusName;
  checks: Partial<Record<ReleaseGateCheckKey, boolean>>;
  reason?: string;
};

type VerifyResponse = { ok?: boolean; reason?: string; checks?: Record<string, boolean> };

const PASS_TTL_MS = 60_000;

const CHECK_LABELS: Array<{ key: ReleaseGateCheckKey; label: string }> = [
  { key: "selected", label: "A film release asset is selected" },
  { key: "providerReady", label: "Provider asset is ready" },
  { key: "nonpublicPolicy", label: "Playback policy is not public" },
  { key: "hashMatchesArc", label: "Playback hash matches Arc" },
  { key: "playbackProtected", label: "Test playback stayed protected" },
];

export function useReleaseGate(campaign: Address, enabled: boolean) {
  const [state, setState] = useState<ReleaseGateState>({ status: "idle", checks: {} });
  const enabledRef = useRef(enabled);
  const statusRef = useRef<ReleaseGateStatusName>("idle");
  const passedAtRef = useRef(0);
  const checksRef = useRef<Partial<Record<ReleaseGateCheckKey, boolean>>>({});
  const pendingRef = useRef<Promise<ReleaseGateState> | undefined>(undefined);

  const apply = useCallback((next: ReleaseGateState) => {
    statusRef.current = next.status;
    checksRef.current = next.checks;
    if (next.status === "passed") passedAtRef.current = Date.now();
    setState(next);
    return next;
  }, []);

  const run = useCallback(
    (force: boolean): Promise<ReleaseGateState> => {
      const pending = pendingRef.current;
      if (pending) return pending;
      if (
        !force &&
        statusRef.current === "passed" &&
        Date.now() - passedAtRef.current < PASS_TTL_MS
      )
        return Promise.resolve(
          apply({ status: "passed", checks: checksRef.current }),
        );
      const poll = (async () => {
        passedAtRef.current = 0;
        statusRef.current = "checking";
        setState((current) => ({ ...current, status: "checking" }));
        const finish = (next: ReleaseGateState) => {
          pendingRef.current = undefined;
          // Discard a late result after the gate was disabled; fail closed to idle.
          return enabledRef.current ? apply(next) : next;
        };
        try {
          const response = await fetch(
            `/api/media/release/verify?arcChainId=${ARC_TESTNET.id}&campaignAddress=${campaign}`,
            { credentials: "same-origin", cache: "no-store" },
          );
          if (response.status === 401)
            return finish({ status: "signed-out", checks: {} });
          if (response.status === 403)
            return finish({
              status: "unavailable",
              checks: {},
              reason: "Only the campaign creator or reviewer may run this release check.",
            });
          if (!response.ok) {
            const body = (await response
              .json()
              .catch(() => undefined)) as { error?: string } | undefined;
            return finish({
              status: "unavailable",
              checks: {},
              reason: body?.error
                ? `Release check unavailable: ${body.error}`
                : "The release check is temporarily unavailable.",
            });
          }
          const data = (await response.json()) as VerifyResponse;
          if (!data.ok)
            return finish({
              status: "failed",
              checks: data.checks ?? {},
              reason:
                data.reason ??
                "The film release did not pass one of the final-delivery checks.",
            });
          return finish({ status: "passed", checks: data.checks ?? {} });
        } catch {
          return finish({
            status: "unavailable",
            checks: {},
            reason: "The release check could not be reached. Try again.",
          });
        }
      })();
      pendingRef.current = poll;
      return poll;
    },
    [campaign, apply],
  );

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      statusRef.current = "idle";
      passedAtRef.current = 0;
      setState({ status: "idle", checks: {} });
      return;
    }
    void run(false).catch(() => undefined);
  }, [enabled, run]);

  return { status: state.status, checks: state.checks, reason: state.reason, recheck: run };
}

export function ReleaseGateStatus({ gate }: { gate: ReturnType<typeof useReleaseGate> }) {
  const session = useSession();
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <p className="text-sm font-bold text-white">Film release gate</p>
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
        Trusted off-chain evidence, not an on-chain proof. You may still reject.
      </p>
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
            onClick={() => void gate.recheck(true)}
          >
            {gate.status === "checking" ? "Rechecking…" : "Recheck"}
          </Button>
        )}
        {gate.status === "signed-out" && (
          <Button
            type="button"
            disabled={session.busy}
            onClick={() => void session.signIn().then(() => gate.recheck(true))}
          >
            {session.busy ? "Waiting for signature…" : "Sign in with wallet"}
          </Button>
        )}
      </div>
      {session.error && <p role="alert" className="text-xs">{session.error}</p>}
    </div>
  );
}
