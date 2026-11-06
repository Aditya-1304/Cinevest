"use client";

import { useState } from "react";
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { asc, eq, and } from "@arkiv-network/sdk/query";
import { str } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { PortableManifest } from "@/components/campaign/portable-manifest";
import { filmSchema } from "@/lib/arkiv-creator";

type Listing = { id: string; title: string; genre: string; creator: string; campaign: string };

/** Independent, public Arkiv reader. Listings are discovery metadata, not verified financial claims. */
export default function Explorer() {
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

  return <main className="mx-auto max-w-4xl space-y-6 p-8">
    <h1 className="text-3xl font-bold">Arkiv film explorer</h1>
    <p>Search public listings across creators directly on Arkiv. No Cinevest backend or SQL database is required. Listings are unverified; confirm campaign terms on Arc before funding.</p>
    <form className="flex gap-3" onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <input aria-label="Genre" className="rounded border p-2" value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Exact genre, or all genres" />
      <button disabled={busy} type="submit">{busy ? "Searching…" : "Search Arkiv"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <ul className="space-y-4">{rows.map((film) => <li className="rounded border p-4" key={film.id}>
      <h2 className="text-xl">{film.title}</h2><p>{film.genre}</p>
      <p className="break-all">Creator: {film.creator}</p>
      <a href={`https://testnet.arcscan.app/address/${film.campaign}`}>Campaign on Arc</a>{" · "}
      <a href={`https://rabdi.explorer.arkiv.network/entity/${film.id}`}>Arkiv entity</a>
      <PortableManifest entityId={film.id} />
    </li>)}</ul>
    {more && <button disabled={busy} onClick={() => void search(true)}>Load more</button>}
  </main>;
}
