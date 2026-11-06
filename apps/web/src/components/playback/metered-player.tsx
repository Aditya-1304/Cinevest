"use client";

/**
 * Plays a film through the backend metering gateway. The browser only ever sees gateway URLs, so
 * enforcement lives server-side; this component just reports which content actually played. Reports
 * lost to a closed tab are safe: the server lease expires and unreported reservations are released.
 * Out of funds is not an error here: the buffer plays out, segment requests keep retrying, and a top-up
 * resumes playback in place.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import MuxPlayer, { type MuxPlayerRefAttributes } from "@mux/mux-player-react";
import { type Address } from "viem";
import { postViewing, viewingManifest, type ViewingAccount } from "@/lib/viewing";

const HEARTBEAT_MS = 10_000;
/** A larger jump between time updates is a seek, so the content in between was never played. */
const MAX_PLAY_STEP_SECONDS = 2;
/** Well inside the server's delivery ceiling, so normal playback never outruns its reservation. */
const BUFFER_SECONDS = 30;
const LOW_BALANCE_SECONDS = 60;
/** Effectively unlimited: the gateway answers 503 until the viewer tops up or playback reports catch up. */
const HLS_CONFIG = {
  maxBufferLength: BUFFER_SECONDS,
  maxMaxBufferLength: BUFFER_SECONDS,
  fragLoadPolicy: {
    default: {
      maxTimeToFirstByteMs: 10_000,
      maxLoadTimeMs: 120_000,
      timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
      errorRetry: { maxNumRetry: 1_000_000, retryDelayMs: 2_000, maxRetryDelayMs: 4_000 },
    },
  },
};
const MAX_RANGES = 256;

/** A server denial code, or `interrupted` for a player failure. */
export type MeteredEnd = string;

export function MeteredPlayer({ campaign, sessionId, startSeconds, onEnd }: {
  campaign: Address;
  sessionId: string;
  startSeconds: number;
  onEnd: (reason: MeteredEnd) => void;
}) {
  const played = useRef<[number, number][]>([]);
  const position = useRef(startSeconds);
  const [fundedSeconds, setFundedSeconds] = useState<number>();
  const [src, setSrc] = useState<string>();
  const player = useRef<MuxPlayerRefAttributes>(null);

  // mux-player drops its `_hlsConfig` prop, so configure the inner video element before giving it a source.
  useEffect(() => {
    const video = (player.current as unknown as { media?: { _hlsConfig: typeof HLS_CONFIG } } | null)?.media;
    if (video) video._hlsConfig = HLS_CONFIG;
    setSrc(viewingManifest(campaign, sessionId));
  }, [campaign, sessionId]);

  const beat = useCallback(async () => {
    const ranges = played.current.filter(([start, end]) => end > start).slice(-MAX_RANGES).map(([start, end]) => [start, end]);
    const response = await postViewing("heartbeat", campaign, { sessionId, positionSeconds: position.current, played: ranges });
    if (response.status === 409) {
      onEnd(((await response.json()) as { error: string }).error);
      return null;
    }
    if (!response.ok) return null;
    // Keep only the open tail; everything before it is now durable on the server.
    const open = played.current.at(-1);
    played.current = open ? [[open[1], open[1]]] : [];
    const account = (await response.json()) as ViewingAccount;
    setFundedSeconds(account.fundedSeconds);
    return account;
  }, [campaign, onEnd, sessionId]);

  useEffect(() => {
    // A failed heartbeat retries on the next tick; ranges stay queued until one is acknowledged.
    const timer = setInterval(() => void beat().catch(() => undefined), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [beat]);

  function trackTime(time: number) {
    position.current = time;
    const open = played.current.at(-1);
    if (open && time >= open[1] && time - open[1] <= MAX_PLAY_STEP_SECONDS) open[1] = time;
    else played.current.push([time, time]);
  }

  return (
    <div className="relative h-full w-full">
      <MuxPlayer
        ref={player}
        streamType="on-demand"
        src={src}
        startTime={startSeconds}
        preload="metadata"
        disableTracking
        style={{ width: "100%", height: "100%" }}
        onTimeUpdate={(event) => trackTime((event.target as HTMLMediaElement).currentTime)}
        onError={() => onEnd("interrupted")}
      />
      {fundedSeconds !== undefined && fundedSeconds < LOW_BALANCE_SECONDS && (
        <p role="status" className="absolute inset-x-3 top-3 rounded-lg bg-black/80 px-3 py-2 text-xs !text-[#d3ed05]">
          {fundedSeconds === 0
            ? "Viewing balance used up. Playback stops when buffered video ends; add funds and it resumes automatically."
            : "Less than a minute of viewing balance left. Top up to keep watching."}
        </p>
      )}
    </div>
  );
}
