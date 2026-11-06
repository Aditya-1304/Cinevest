"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { fetchFilmDetail, fetchPitch, posterUrl } from "@/lib/market";
import { PosterImage } from "./poster-image";

const BLOCKS_PER_DAY = 43_200n;

const LISTING: Record<string, { label: string; tone: string }> = {
  listed: { label: "Listed on Arkiv", tone: "border-[#d3ed05]/40 bg-[#d3ed05]/15 text-[#d3ed05]" },
  unlisted: { label: "Not listed on Arkiv", tone: "border-amber-400/40 bg-amber-400/15 text-amber-300" },
  unavailable: { label: "Listing status unavailable", tone: "border-white/20 bg-white/5 text-white/70" },
};

/** Long pitches are clamped so one verbose listing cannot dominate the page. */
function ClampedText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420;
  return (
    <div>
      <p className={`text-sm whitespace-pre-wrap break-words text-white/80 ${long && !open ? "line-clamp-5" : ""}`}>{text}</p>
      {long && (
        <button type="button" className="mt-1 text-xs font-bold text-[#d3ed05] hover:text-[#e4ff1a]" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/**
 * Public story for a campaign: the poster and pitch are fetched through the backend, which checks
 * the bytes against the commitment stored in the Arc terms. Arc remains canonical when the
 * Arkiv listing expires.
 */
export function FilmStory({ campaign }: { campaign: Address }) {
  const detail = useQuery({
    queryKey: ["film-detail", campaign],
    queryFn: () => fetchFilmDetail(campaign),
  });
  const pitchRef = detail.data?.terms.pitchReference;
  const pitch = useQuery({
    queryKey: ["pitch", campaign, pitchRef],
    enabled: !!pitchRef,
    retry: 1,
    queryFn: () => fetchPitch(pitchRef!, campaign),
  });

  // An unregistered or unreadable campaign is explained by the contract card below.
  if (detail.isError) return null;
  if (detail.isPending || pitch.isPending)
    return (
      <div role="status" className="flex gap-4 rounded-2xl border border-white/10 bg-[#04141C] p-4">
        <span className="sr-only">Loading the film story…</span>
        <div className="h-40 w-28 animate-pulse rounded-lg bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-1/2 animate-pulse rounded bg-white/5" />
          <div className="h-4 w-full animate-pulse rounded bg-white/5" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
        </div>
      </div>
    );
  if (pitch.isError)
    return (
      <p role="alert" className="rounded-2xl border border-white/10 bg-[#04141C] p-4 text-xs text-amber-300">
        The pitch could not be verified from Swarm right now.{" "}
        <button type="button" className="underline" onClick={() => void pitch.refetch()}>
          Try again
        </button>
      </p>
    );

  const listing = LISTING[detail.data.listingStatus] ?? LISTING.unavailable;
  const days =
    detail.data.listing && detail.data.listingStatus === "listed"
      ? Number(BigInt(detail.data.listing.remainingBlocks) / BLOCKS_PER_DAY)
      : undefined;
  const manifest = pitch.data;

  return (
    <article className="grid gap-4 rounded-2xl border border-white/10 bg-[#04141C] p-4 min-[641px]:grid-cols-[160px_minmax(0,1fr)]">
      <PosterImage
        src={posterUrl(manifest.posterRef)}
        alt={`${manifest.title} poster`}
        className="aspect-[2/3] w-full max-w-[160px] rounded-lg bg-[#072733] object-cover"
      />
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-white/60">{manifest.genre}</span>
          <span className={`rounded-full border px-2 py-0.5 font-bold ${listing.tone}`}>
            {listing.label}
            {days !== undefined && ` · about ${days} day${days === 1 ? "" : "s"} left`}
          </span>
        </div>
        <h1 className="font-dela !my-1 text-[clamp(22px,3vw,34px)] uppercase">{manifest.title}</h1>
        <ClampedText text={manifest.synopsis} />
        <p className="text-xs text-white/50">{manifest.rightsNotice}</p>
        {detail.data.listingStatus === "unlisted" && (
          <p className="text-xs text-amber-300">
            The Arkiv listing expired or was never published. This campaign is still live on Arc and
            can be reached by its link.
          </p>
        )}
      </div>
    </article>
  );
}
