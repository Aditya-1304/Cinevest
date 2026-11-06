import { AppShell } from "@/components/shell/app-shell";
import { DiscoverBoard } from "@/components/campaign/discover-board";

export const metadata = { title: "Discover films — Cinevest" };

export default function DiscoverPage() {
  return (
    <AppShell>
      <p className="text-xs font-bold !text-[#d3ed05]">Discover</p>
      <h1>Films seeking backers.</h1>
      <p className="mb-6 max-w-[640px]">
        Listings are published by creators on Arkiv and checked against the
        campaign contracts on Arc Testnet. Released films have a Watch button;
        you buy access with test USDC on the film page. Test USDC has no
        monetary value.
      </p>
      <DiscoverBoard />
    </AppShell>
  );
}
