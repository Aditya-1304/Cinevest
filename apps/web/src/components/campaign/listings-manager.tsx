"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useConfig, useSignMessage } from "wagmi";
import { getAccount } from "wagmi/actions";
import type { EIP1193Provider } from "viem";
import { ARC_TESTNET } from "@/lib/chain";
import { filmPath } from "@/lib/paths";
import { extendCreatorListing } from "@/lib/arkiv-creator";
import { fetchFilmDetail, fetchMarket, type MarketFilm } from "@/lib/market";
import { signedPost } from "@/lib/publication-client";

// Rabdi produces roughly one block every two seconds; the backend uses the same estimate.
const BLOCKS_PER_DAY = 43_200n;
const MAX_HORIZON_DAYS = 30n;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ListingRow({ film, onChanged }: { film: MarketFilm; onChanged: () => void }) {
  const { address, connector } = useAccount();
  const config = useConfig();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const detail = useQuery({
    queryKey: ["film-detail", film.campaignAddress],
    queryFn: () => fetchFilmDetail(film.campaignAddress),
  });
  const remaining = detail.data?.listing
    ? BigInt(detail.data.listing.remainingBlocks)
    : undefined;
  const expires = detail.data?.listing?.expiresAtBlock;
  const days = remaining === undefined ? undefined : Number(remaining / BLOCKS_PER_DAY);
  // Largest target the backend accepts: 30 days past the current Rabdi block.
  const target =
    remaining !== undefined && expires
      ? BigInt(expires) - remaining + MAX_HORIZON_DAYS * BLOCKS_PER_DAY - 200n
      : undefined;
  const canExtend = !!address && target !== undefined && expires !== undefined && target > BigInt(expires ?? 0);

  async function extend() {
    if (!address || target === undefined || busy) return;
    setBusy(true);
    setMessage("Sign to check that this listing can be renewed…");
    const sign = (text: string) => signMessageAsync({ message: text });
    const identity = {
      action: "extend-listing",
      actor: address,
      entityId: film.entityId,
      campaignAddress: film.campaignAddress,
      targetBlock: target.toString(),
    };
    try {
      const preflight = await signedPost<{ authorized?: boolean; error?: string; status?: string }>(
        "/api/listings/extend",
        identity,
        sign,
      );
      if (!preflight.ok) throw new Error(preflight.data.error ?? "Renewal was refused.");
      if (preflight.data.status === "confirmed") {
        setMessage("This listing is already renewed to that block.");
        return;
      }
      if (!preflight.data.authorized) throw new Error("The renewal is already in progress; try again shortly.");
      const provider = (await connector?.getProvider()) as EIP1193Provider | undefined;
      if (!provider) throw new Error("No wallet provider is available.");
      setMessage("Confirm the renewal in your wallet (network: Arkiv Rabdi)…");
      const sent = await extendCreatorListing(provider, address, film.entityId as `0x${string}`, target);
      // Wait until wagmi sees the switch back to Arc before signing again.
      for (let i = 0; i < 40 && getAccount(config).chainId !== ARC_TESTNET.id; i++) await sleep(250);
      const txHash = (sent as { txHash?: string }).txHash;
      setMessage("Recording the renewal…");
      const recorded = await signedPost<{ status?: string; error?: string }>(
        "/api/listings/extend",
        { ...identity, txHash },
        sign,
      );
      if (!recorded.ok) throw new Error(recorded.data.error ?? "The renewal could not be recorded.");
      setMessage("Listing renewed.");
      await detail.refetch();
      onChanged();
    } catch (error) {
      const text = error instanceof Error ? (error.message.split(/\r?\n/)[0] ?? "") : "";
      setMessage(/reject|denied/i.test(text) ? "The renewal was rejected in your wallet." : text || "The renewal failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#04141C] p-4">
      <div className="min-w-0">
        <Link className="font-dela text-sm uppercase hover:text-[#d3ed05]" href={filmPath(film.campaignAddress)}>
          {film.title}
        </Link>
        <p className="mt-1 text-xs text-white/60">
          {detail.isPending
            ? "Checking listing lifetime…"
            : days === undefined
              ? "Listing details are unavailable."
              : `Listed on Arkiv · about ${days} day${days === 1 ? "" : "s"} remaining`}
        </p>
        {!message && days !== undefined && !canExtend && (
          <p className="mt-1 text-xs text-white/50">
            Already at the 30-day maximum. You can extend again as the listing runs down.
          </p>
        )}
        {message && (
          <p role="status" aria-live="polite" className="mt-1 text-xs text-amber-300">
            {message}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={!canExtend || busy}
        className="h-9 rounded-lg border border-[#d3ed05] bg-[#d3ed05] px-4 text-xs font-bold text-black hover:bg-[#e4ff1a] disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => void extend()}
      >
        {busy ? "Renewing…" : "Extend 30 days"}
      </button>
    </li>
  );
}

/** Listings the connected creator owns on Arkiv, with renewal. Listings are public; Arc stays canonical. */
export function ListingsManager() {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const owned = useQuery({
    queryKey: ["my-listings", address],
    enabled: !!address,
    queryFn: () => fetchMarket({ owner: address }),
  });
  if (!address) return null;
  return (
    <section className="mt-8 space-y-3" aria-labelledby="listings-title">
      <h2 id="listings-title" className="font-dela text-lg uppercase">
        Your Arkiv listings
      </h2>
      <p className="text-xs text-white/60">
        Listings last 30 days on Arkiv. An expired listing disappears from discovery, but the
        campaign stays available on Arc. Renewal needs the creator wallet that published it.
      </p>
      {owned.isPending ? (
        <p role="status" className="text-xs text-white/60">Loading your listings…</p>
      ) : owned.isError ? (
        <p role="alert" className="text-xs text-red-300">Your listings could not be loaded. Try again shortly.</p>
      ) : owned.data.films.length === 0 ? (
        <p className="text-xs text-white/60">You have no active Arkiv listings.</p>
      ) : (
        <ul className="space-y-3">
          {owned.data.films.map((film) => (
            <ListingRow
              key={film.key}
              film={film}
              onChanged={() => void queryClient.invalidateQueries({ queryKey: ["my-listings"] })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
