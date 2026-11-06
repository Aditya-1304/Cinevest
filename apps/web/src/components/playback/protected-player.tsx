"use client";

/**
 * Paid-viewing surface. It never decides access itself: it signs the viewer in (SIWE), asks
 * /api/playback/authorize for an asset-scoped token, and hands that token to the Mux player.
 * Denied and unavailable states are explicit. The token outlives the film, so there is no mid-play
 * renewal; a lapsed token or interrupted playback is recovered with Retry, which requests a fresh one.
 */
import { useEffect, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { useAccount } from "wagmi";
import { type Address } from "viem";
import { ARC_TESTNET } from "@/lib/chain";
import { useSession } from "@/lib/use-session";
import { WalletConnect } from "@/components/wallet/wallet-connect";

type Grant = { playbackId: string; token: string; expiresAt: string };
type View =
  | { kind: "idle" }
  | { kind: "authorizing" }
  | { kind: "playing"; grant: Grant }
  | { kind: "denied"; message: string }
  | { kind: "unavailable"; message: string };

const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg bg-[#d3ed05] px-4 text-xs font-bold text-black disabled:opacity-60";

async function authorize(campaign: Address, setView: (view: View) => void, signedOut: () => void) {
  setView({ kind: "authorizing" });
  try {
    const response = await fetch("/api/playback/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ arcChainId: String(ARC_TESTNET.id), campaignAddress: campaign }),
    });
    if (response.status === 401) return signedOut();
    if (response.status === 403) return setView({ kind: "denied", message: "This wallet has not purchased access to this film." });
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

  useEffect(() => {
    if (active) void authorize(campaign, setView, () => { setView({ kind: "idle" }); void refresh(); });
  }, [active, campaign, refresh, attempt]);

  if (!isConnected) return <Notice title="Connect your wallet" body="Connect the wallet that purchased access."><WalletConnect /></Notice>;
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
        <button type="button" className={buttonClass} onClick={() => setAttempt((count) => count + 1)}>Retry</button>
      </Notice>
    );
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
