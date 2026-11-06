"use client";

/**
 * Paid-viewing surface. It never decides access itself: it signs the viewer in (SIWE), asks
 * /api/playback/authorize for an asset-scoped token, and hands that token to the Mux player. Wallets
 * without full access fall through to a metered session, which plays via the backend gateway instead.
 * Denied and unavailable states are explicit. The token outlives the film, so there is no mid-play
 * renewal; a lapsed token or interrupted playback is recovered with Retry, which requests a fresh one.
 */
import { useCallback, useEffect, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { useAccount } from "wagmi";
import { type Address } from "viem";
import { ARC_TESTNET } from "@/lib/chain";
import { useSession } from "@/lib/use-session";
import { WalletConnect } from "@/components/wallet/wallet-connect";
import { MeteredPlayer, type MeteredEnd } from "@/components/playback/metered-player";
import { postViewing, type ViewingAccount } from "@/lib/viewing";

type Grant = { playbackId: string; token: string; expiresAt: string };
type View =
  | { kind: "idle" }
  | { kind: "authorizing" }
  | { kind: "playing"; grant: Grant }
  | { kind: "metered"; sessionId: string; startSeconds: number }
  | { kind: "paused"; title: string; message: string; action: string }
  | { kind: "denied"; message: string }
  | { kind: "unavailable"; message: string };

const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg bg-[#d3ed05] px-4 text-xs font-bold text-black disabled:opacity-60";

const NEEDS_FUNDS: View = { kind: "paused", title: "Add a viewing balance", message: "Deposit from the Pay as you watch panel, then continue. Unused funds stay refundable.", action: "Continue watching" };

const METERED_DENIALS: Record<string, View> = {
  deposit_required: NEEDS_FUNDS,
  metering_unavailable: { kind: "denied", message: "This wallet has not purchased access to this film." },
  exit_pending: { kind: "paused", title: "Refund pending", message: "This wallet requested an exit. Add funds to cancel it, or withdraw when the window ends.", action: "Check again" },
  closing: { kind: "paused", title: "Refund in progress", message: "Finish your refund in the wallet, or wait five minutes for the unused receipt to expire.", action: "Check again" },
  session_replaced: { kind: "paused", title: "Playing elsewhere", message: "This film is playing in another tab or device. Only one metered session can run at a time.", action: "Watch here instead" },
};

async function startMetered(campaign: Address, setView: (view: View) => void, signedOut: () => void, retry: () => void) {
  const response = await postViewing("session", campaign);
  if (response.status === 401) return signedOut();
  const body = (await response.json()) as { error?: string; fullAccess?: boolean; sessionId?: string; account?: ViewingAccount };
  if (body.fullAccess) return retry();
  if (response.ok && body.sessionId) {
    return setView({ kind: "metered", sessionId: body.sessionId, startSeconds: body.account?.positionSeconds ?? 0 });
  }
  const denial = METERED_DENIALS[body.error ?? ""];
  if (denial) return setView(denial);
  if (response.status === 404) return setView({ kind: "denied", message: "This film has not been released yet." });
  throw new Error("session");
}

async function authorize(campaign: Address, setView: (view: View) => void, signedOut: () => void, retry: () => void) {
  setView({ kind: "authorizing" });
  try {
    const response = await fetch("/api/playback/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ arcChainId: String(ARC_TESTNET.id), campaignAddress: campaign }),
    });
    if (response.status === 401) return signedOut();
    if (response.status === 403) return await startMetered(campaign, setView, signedOut, retry);
    if (response.status === 404) return setView({ kind: "denied", message: "This film has not been released yet." });
    if (!response.ok) throw new Error("authorize");
    setView({ kind: "playing", grant: (await response.json()) as Grant });
  } catch {
    setView({ kind: "unavailable", message: "Playback is temporarily unavailable." });
  }
}

export function ProtectedPlayer({ campaign }: { campaign: Address }) {
  const { isConnected } = useAccount();
  const session = useSession();
  const [view, setView] = useState<View>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const { active, refresh } = session;
  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  useEffect(() => {
    if (active) void authorize(campaign, setView, () => { setView({ kind: "idle" }); void refresh(); }, retry);
  }, [active, campaign, refresh, attempt, retry]);

  const meteredEnded = useCallback((reason: MeteredEnd) => {
    const denial = METERED_DENIALS[reason];
    if (denial) setView(denial);
    else if (reason === "interrupted") setView({ kind: "unavailable", message: "Playback was interrupted." });
    else retry();
  }, [retry]);

  if (!isConnected) return <Notice title="Connect your wallet" body="Connect your wallet to watch this film."><WalletConnect /></Notice>;
  if (!session.checked) return <Notice title="Checking sign-in…" />;
  if (!session.active) {
    return (
      <Notice title="Sign in to watch" body="Sign a message to prove you own this wallet. No transaction or fee.">
        <button type="button" className={buttonClass} disabled={session.busy} onClick={() => void session.signIn()}>
          {session.busy ? "Waiting for signature…" : "Sign in with wallet"}
        </button>
        {session.error && <p role="alert">{session.error}</p>}
      </Notice>
    );
  }
  if (view.kind === "idle" || view.kind === "authorizing") return <Notice title="Preparing secure playback…" />;
  if (view.kind === "denied") return <Notice title="Playback not available" body={view.message} />;
  if (view.kind === "unavailable") {
    return (
      <Notice title="Playback unavailable" body={view.message}>
        <button type="button" className={buttonClass} onClick={retry}>Retry</button>
      </Notice>
    );
  }
  if (view.kind === "paused") {
    return (
      <Notice title={view.title} body={view.message}>
        <button type="button" className={buttonClass} onClick={retry}>{view.action}</button>
      </Notice>
    );
  }
  if (view.kind === "metered") {
    return <MeteredPlayer key={view.sessionId} campaign={campaign} sessionId={view.sessionId} startSeconds={view.startSeconds} onEnd={meteredEnded} />;
  }
  return (
    <MuxPlayer
      streamType="on-demand"
      playbackId={view.grant.playbackId}
      tokens={{ playback: view.grant.token }}
      style={{ width: "100%", aspectRatio: "16 / 9" }}
      onError={() => setView({ kind: "unavailable", message: "Playback was interrupted." })}
    />
  );
}

function Notice({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <strong className="text-xl text-white">{title}</strong>
      {body && <p className="text-white/70">{body}</p>}
      {children}
    </div>
  );
}
