"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CAMPAIGN_STAGES } from "@/lib/chain";
import { filmPath } from "@/lib/paths";

type Film = {
  key: string;
  title: string;
  genre: string;
  campaignAddress: string;
  creatorAddress: string;
  stage: number;
};

export function LiveDiscovery({
  genre,
  stage,
  deadline,
}: {
  genre: string;
  stage: string;
  deadline: string;
}) {
  const [offset, setOffset] = useState(0);
  const films = useQuery({
    queryKey: ["discovery", genre, deadline, offset],
    queryFn: async () => {
      const params = new URLSearchParams({ offset: String(offset) });
      if (genre !== "All") params.set("genre", genre);
      if (deadline)
        params.set(
          "deadline",
          String(Math.floor(Date.parse(`${deadline}T23:59:59Z`) / 1000)),
        );
      const response = await fetch(`/api/films?${params}`);
      if (!response.ok) throw new Error("Discovery is unavailable.");
      return (await response.json()) as {
        films: Film[];
        nextOffset: number | null;
      };
    },
  });
  const visible =
    films.data?.films.filter(
      (film) => stage === "All" || CAMPAIGN_STAGES[film.stage] === stage,
    ) ?? [];
  return (
    <div className="mt-8 space-y-4">
      <h3 className="text-lg font-semibold">Live campaigns</h3>
      {films.isPending ? (
        <p>Loading campaigns…</p>
      ) : films.isError ? (
        <p role="alert">
          Could not load live campaigns.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void films.refetch()}
          >
            Retry
          </button>
        </p>
      ) : visible.length === 0 ? (
        <p>No live campaigns match on this page.</p>
      ) : (
        <div className="grid gap-4 min-[761px]:grid-cols-3">
          {visible.map((film) => (
            <article
              key={film.key}
              className="border-white/10 bg-[#04141C] rounded-2xl border p-5"
            >
              <p className="text-xs text-white/60">
                {film.genre} · {CAMPAIGN_STAGES[film.stage] ?? "Unknown"}
              </p>
              <h4 className="mt-3 font-semibold">
                <Link
                  className="underline"
                  href={filmPath(film.campaignAddress)}
                >
                  {film.title}
                </Link>
              </h4>
              <p className="mt-3 text-xs break-all text-white/60">
                Creator: {film.creatorAddress}
              </p>
            </article>
          ))}
        </div>
      )}
      <div className="flex gap-4 text-sm">
        {offset > 0 && (
          <button
            type="button"
            className="underline"
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            Previous
          </button>
        )}
        {films.data?.nextOffset != null && (
          <button
            type="button"
            className="underline"
            onClick={() => setOffset(films.data!.nextOffset!)}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
