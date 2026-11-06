import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { WalletDashboard } from "@/components/dashboard/wallet-dashboard";

export default function BackerDashboard() {
  return (
    <AppShell compact>
      <div className="mb-6 block gap-6 min-[761px]:flex min-[761px]:items-end min-[761px]:justify-between [&_h1]:!my-2 [&_h1]:!text-[clamp(28px,3vw,40px)] [&_p]:mb-0 [&>a]:mt-5 min-[761px]:[&>a]:mt-0">
        <div>
          <p className="text-xs font-bold !text-[#d3ed05]">Backer workspace</p>
          <h1>The stories you support.</h1>
          <p>
            Contributions and receipts for your connected wallet, read from Arc
            Testnet.
          </p>
        </div>
        <Link
          className="hover:border-[#d3ed05] inline-flex items-center justify-center rounded-lg border border-white/15 bg-transparent px-5 py-[13px] text-xs font-bold text-white transition"
          href="/demo"
        >
          Discover films
        </Link>
      </div>
      <WalletDashboard mode="backer" />
    </AppShell>
  );
}
