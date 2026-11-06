"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CAMPAIGN_STAGES } from "@/lib/chain";
import { filmPath } from "@/lib/paths";
import { formatUsdc } from "@/lib/format";
import { fetchMarket, posterUrl, type MarketFilm } from "@/lib/market";
import { stagePillClass } from "@/lib/stage-style";

function FilmTile({ film }: { film: MarketFilm }) {
  const stage = film.stage === null ? undefined : CAMPAIGN_STAGES[film.stage];
  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-[#04141C]">
      <Link href={filmPath(film.campaignAddress)} className="block">
        {/* Posters are verified Swarm bytes served by the backend, so next/image cannot optimize them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={posterUrl(film.posterSwarmRef)}
          alt={`${film.title} poster`}
          loading="lazy"
          className="aspect-[2/3] w-full bg-[#072733] object-cover"
        />
      </Link>
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
          <span>{film.genre}</span>
          {stage && (
            <span
              className={`rounded-full border px-2 py-0.5 font-bold ${stagePillClass(stage)}`}
            >
              {stage}
            </span>
          )}
        </div>
        <h3 className="font-dela text-base uppercase">
          <Link className="hover:text-[#d3ed05]" href={filmPath(film.campaignAddress)}>
            {film.title}
          </Link>
        </h3>
        <p className="text-xs text-white/60">
          {film.raised === null
            ? "Funding data is temporarily unavailable."
            : `${formatUsdc(BigInt(film.raised))} test USDC raised`}
          {film.stale && " (stale)"}
        </p>
      </div>
    </article>
  );
}

/** Public discovery: Arkiv listings verified against Arc, filtered by genre, paged by cursor. */
export function DiscoverBoard() {
  const [genreInput, setGenreInput] = useState("");
  const [genre, setGenre] = useState("");
  const films = useInfiniteQuery({
    queryKey: ["market", genre],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMarket({ genre: genre || undefined, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
  });
  const pages = films.data?.pages ?? [];
  const all = pages.flatMap((page) => page.films);
  const last = pages[pages.length - 1];
  const degraded = last && (last.status !== "complete" || last.completeness !== "exact");

  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap items-end gap-3 [&_input]:h-10 [&_input]:rounded-md [&_input]:border [&_input]:border-white/15 [&_input]:bg-[#072733] [&_input]:px-3 [&_input]:text-sm [&_input]:text-white [&_label]:text-xs [&_label]:font-bold"
        onSubmit={(event) => {
          event.preventDefault();
          setGenre(genreInput.trim());
        }}
      >
        <div className="grid gap-1">
          <label htmlFor="genre-filter">Genre</label>
          <input
            id="genre-filter"
            placeholder="e.g. Drama"
            value={genreInput}
            onChange={(event) => setGenreInput(event.target.value)}
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg border border-[#d3ed05] bg-[#d3ed05] px-4 text-xs font-bold text-black hover:bg-[#e4ff1a]"
        >
          Filter
        </button>
        {genre && (
          <button
            type="button"
            className="h-10 rounded-lg border border-white/15 px-4 text-xs font-bold text-white/70"
            onClick={() => {
              setGenre("");
              setGenreInput("");
            }}
          >
            Clear
          </button>
        )}
      </form>

      {films.isPending ? (
        <div role="status" className="grid gap-4 min-[561px]:grid-cols-2 min-[961px]:grid-cols-4">
          <span className="sr-only">Loading films…</span>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="aspect-[2/3] animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : films.isError ? (
        <p role="alert" className="text-sm text-red-300">
          Discovery is unavailable right now.{" "}
          <button type="button" className="underline" onClick={() => void films.refetch()}>
            Try again
          </button>
        </p>
      ) : all.length === 0 ? (
        <p className="text-sm text-white/70">
          {genre ? `No published films match “${genre}”.` : "No films are published yet."}{" "}
          <Link className="text-[#d3ed05] underline" href="/create">
            Publish the first one
          </Link>
        </p>
      ) : (
        <div className="grid gap-4 min-[561px]:grid-cols-2 min-[961px]:grid-cols-4">
          {all.map((film) => (
            <FilmTile key={film.key} film={film} />
          ))}
        </div>
      )}

      {degraded && (
        <p role="status" className="text-xs text-amber-300">
          {last.status === "unavailable"
            ? "Arkiv discovery is temporarily unavailable. Try again shortly."
            : "This list may be incomplete: some listings could not be checked yet."}
          {last.excluded > 0 && ` ${last.excluded} listing(s) failed verification and were hidden.`}
        </p>
      )}

      {films.hasNextPage && (
        <button
          type="button"
          disabled={films.isFetchingNextPage}
          className="h-10 rounded-lg border border-white/15 px-5 text-xs font-bold hover:border-[#d3ed05]"
          onClick={() => void films.fetchNextPage()}
        >
          {films.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
