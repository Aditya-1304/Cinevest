"use client";

import { useState } from "react";
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { asc, eq, and } from "@arkiv-network/sdk/query";
import { str } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { PortableManifest } from "@/components/campaign/portable-manifest";
import { filmSchema } from "@/lib/arkiv-creator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Listing = { id: string; title: string; genre: string; creator: string; campaign: string };

/** Independent, public Arkiv reader. Listings are discovery metadata, not verified financial claims. */
export function ArkivExplorer() {
  const [genre, setGenre] = useState("");
  const [activeGenre, setActiveGenre] = useState("");
  const [rows, setRows] = useState<Listing[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(next = false) {
    setBusy(true);
    setError("");
    try {
      const client = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http(undefined, { timeout: 10000, retryCount: 0 }) });
      const selectedGenre = next ? activeGenre : genre.trim();
      const filters = [];
      if (selectedGenre) filters.push(eq("genre", str(selectedGenre)));

      const query = client.select({ $key: true, title: true, genre: true, creatorAddress: true, campaignAddress: true })
        .from(filmSchema, { onMismatch: "skip" }).orderBy(asc("$key")).limit(20);
      if (next) query.offset(offset);
      if (filters.length) query.where(and(...filters));
      const page = await query.fetch();
      const listings = page.entities.map((film) => ({
        id: film.$key, title: film.title.value, genre: film.genre.value,
        creator: film.creatorAddress.value, campaign: film.campaignAddress.value,
      }));
      setRows((previous) => next ? [...previous, ...listings] : listings);
      setActiveGenre(selectedGenre);
      const scanned = page.entities.length + page.skipped;
      setOffset((next ? offset : 0) + scanned);
      setMore(scanned === 20);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Arkiv search failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <form
        className="flex max-w-xl flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <div className="grid min-w-[220px] flex-1 gap-1.5">
          <label htmlFor="explorer-genre" className="text-[13px] font-bold text-white">Genre</label>
          <Input id="explorer-genre" value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Exact genre, or leave empty for all" />
        </div>
        <button
          disabled={busy}
          type="submit"
          className="inline-flex h-9 items-center rounded-lg border border-[#d3ed05] bg-[#d3ed05] px-5 text-xs font-bold text-black transition hover:bg-[#e4ff1a] disabled:opacity-60"
        >
          {busy ? "Searching…" : "Search Arkiv"}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {!busy && !error && rows.length === 0 && (
        <p className="text-sm text-white/60">Run a search to list films published on Arkiv.</p>
      )}
      <ul className="grid gap-4 min-[761px]:grid-cols-2">
        {rows.map((film) => (
          <li className="min-w-0 space-y-2 rounded-2xl border border-white/10 bg-[#04141C] p-5" key={film.id}>
            <p className="text-xs font-bold text-[#d3ed05]">{film.genre}</p>
            <h2 className="font-dela text-xl break-words uppercase">{film.title}</h2>
            <p className="text-xs break-all text-white/60">Creator {film.creator}</p>
            <p className="flex flex-wrap gap-x-4 text-xs font-bold [&_a]:text-[#d3ed05] [&_a:hover]:text-[#e4ff1a]">
              <a href={`https://testnet.arcscan.app/address/${film.campaign}`} target="_blank" rel="noreferrer">Campaign on Arc ↗</a>
              <a href={`https://rabdi.explorer.arkiv.network/entity/${film.id}`} target="_blank" rel="noreferrer">Arkiv entity ↗</a>
            </p>
            <PortableManifest entityId={film.id} />
          </li>
        ))}
      </ul>
      {more && (
        <Button variant="outline" disabled={busy} onClick={() => void search(true)}>
          Load more
        </Button>
      )}
    </div>
  );
}
