import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { ARC_TESTNET } from "@/lib/chain";

/**
 * "Unsupported network" page for canonical campaign URLs whose chainId is not
 * Arc Testnet. Read-only: it renders no campaign data and no financial actions.
 */
export function UnsupportedNetwork({ chainId }: { chainId: string }) {
  return (
    <AppShell compact>
      <section className="rounded-2xl border border-white/10 bg-[#04141C] p-8 text-white">
        <p className="text-xs font-bold !text-[#d3ed05]">Unsupported network</p>
        <h1>Unsupported network</h1>
        <p className="text-white/70">
          Cinevest campaigns run on {ARC_TESTNET.name} (chain {ARC_TESTNET.id}).
          This URL points to chain {chainId}, so no campaign data or actions are
          available here.
        </p>
        <Link
          className="inline-block text-sm font-bold text-[#d3ed05] underline hover:text-[#e4ff1a]"
          href="/demo"
        >
          ← All films
        </Link>
      </section>
    </AppShell>
  );
}
