"use client";

/**
 * Paid-viewing surface. It never decides access itself: it signs the viewer in (SIWE), asks
 * /api/playback/authorize for a short-lived asset-scoped token, and hands that token to the Livepeer
 * player. Denied and unavailable states are explicit, and the token is renewed before it expires.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import * as Player from "@livepeer/react/player";
import { getSrc } from "@livepeer/react/external";
import { useAccount } from "wagmi";
import { type Address } from "viem";
import { ARC_TESTNET } from "@/lib/chain";
import { useSession } from "@/lib/use-session";
import { WalletConnect } from "@/components/wallet/wallet-connect";

type Grant = { playbackId: string; token: string; expiresAt: string; refreshAt: string };
type View =
  | { kind: "idle" }
  | { kind: "authorizing" }
  | { kind: "playing"; grant: Grant; src: NonNullable<ReturnType<typeof getSrc>> }
  | { kind: "denied"; message: string }
  | { kind: "unavailable"; message: string };

const RENEW_RETRY_MS = 15_000;
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg bg-[#d3ed05] px-4 text-xs font-bold text-black disabled:opacity-60";

async function playbackSources(playbackId: string) {
  const response = await fetch(`https://livepeer.studio/api/playback/${encodeURIComponent(playbackId)}`);
  if (!response.ok) throw new Error("playback info");
  return getSrc(await response.json());
}

type Context = {
  campaign: Address;
  setView: (view: View) => void;
  signedOut: () => void;
  timer: RefObject<ReturnType<typeof setTimeout> | undefined>;
  srcFor: RefObject<{ id: string; src: NonNullable<ReturnType<typeof getSrc>> } | undefined>;
};

/** Requests (or renews) a token. During renewal a transient failure keeps current playback going and retries. */
async function authorize(ctx: Context, renewing: boolean): Promise<void> {
  if (!renewing) ctx.setView({ kind: "authorizing" });
  try {
    const response = await fetch("/api/playback/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ arcChainId: String(ARC_TESTNET.id), campaignAddress: ctx.campaign }),
    });
    if (response.status === 401) return ctx.signedOut();
    if (response.status === 403) return ctx.setView({ kind: "denied", message: "This wallet has not purchased access to this film." });
    if (response.status === 404) return ctx.setView({ kind: "denied", message: "This film has not been released yet." });
    if (!response.ok) throw new Error("authorize");
    const grant = (await response.json()) as Grant;
    if (ctx.srcFor.current?.id !== grant.playbackId) {
      const src = await playbackSources(grant.playbackId);
      if (!src) throw new Error("no source");
      ctx.srcFor.current = { id: grant.playbackId, src };
    }
    ctx.setView({ kind: "playing", grant, src: ctx.srcFor.current.src });
    ctx.timer.current = setTimeout(() => void authorize(ctx, true), Math.max(5_000, Date.parse(grant.refreshAt) - Date.now()));
  } catch {
    if (renewing) ctx.timer.current = setTimeout(() => void authorize(ctx, true), RENEW_RETRY_MS);
    else ctx.setView({ kind: "unavailable", message: "Playback is temporarily unavailable." });
  }
}

export function ProtectedPlayer({ campaign }: { campaign: Address }) {
  const { isConnected } = useAccount();
  const session = useSession();
  const [view, setView] = useState<View>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const srcFor = useRef<{ id: string; src: NonNullable<ReturnType<typeof getSrc>> } | undefined>(undefined);
  const { active, refresh } = session;

  useEffect(() => {
    if (!active) return;
    void authorize({ campaign, setView, signedOut: () => { setView({ kind: "idle" }); void refresh(); }, timer, srcFor }, false);
    // The latest renewal timer, not the one at effect start, must be cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => clearTimeout(timer.current);
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
    <Player.Root src={view.src} jwt={view.grant.token} aspectRatio={16 / 9} autoPlay={false}>
      <Player.Container className="relative h-full w-full overflow-hidden rounded-2xl bg-black">
        <Player.Video title="Film" className="h-full w-full" />
        <Player.LoadingIndicator className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">Loading…</Player.LoadingIndicator>
        <Player.ErrorIndicator matcher="all" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-sm text-white">
          <span>Playback was interrupted.</span>
          <button type="button" className={buttonClass} onClick={() => setAttempt((count) => count + 1)}>Retry</button>
        </Player.ErrorIndicator>
        <Player.Controls className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 p-3">
          <Player.PlayPauseTrigger className="text-xs font-bold text-white">
            <Player.PlayingIndicator asChild matcher={false}><span>Play</span></Player.PlayingIndicator>
            <Player.PlayingIndicator asChild><span>Pause</span></Player.PlayingIndicator>
          </Player.PlayPauseTrigger>
          <Player.FullscreenTrigger className="ml-auto text-xs font-bold text-white">Fullscreen</Player.FullscreenTrigger>
        </Player.Controls>
      </Player.Container>
    </Player.Root>
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
