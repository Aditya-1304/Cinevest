import { AppShell } from "@/components/shell/app-shell";
import { ArkivExplorer } from "@/components/explorer/arkiv-explorer";

export const metadata = { title: "Arkiv film explorer — Cinevest" };

export default function ExplorerPage() {
  return (
    <AppShell>
      <p className="text-xs font-bold !text-[#d3ed05]">Explorer</p>
      <h1>Arkiv film explorer.</h1>
      <p className="mb-6 max-w-[640px]">
        Search public listings across creators directly on Arkiv. No Cinevest backend or SQL
        database is required. Listings are unverified; confirm campaign terms on Arc before funding.
      </p>
      <ArkivExplorer />
    </AppShell>
  );
}
