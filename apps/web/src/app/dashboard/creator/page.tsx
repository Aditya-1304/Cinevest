import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { WalletDashboard } from "@/components/dashboard/wallet-dashboard";
import { ListingsManager } from "@/components/campaign/listings-manager";

export default function CreatorDashboard() {
  return (
    <AppShell compact>
      <div className="mb-6 block gap-6 min-[761px]:flex min-[761px]:items-end min-[761px]:justify-between [&_h1]:!my-2 [&_h1]:!text-[clamp(28px,3vw,40px)] [&_p]:mb-0 [&>a]:mt-5 min-[761px]:[&>a]:mt-0">
        <div>
          <p className="text-xs font-bold !text-[#d3ed05]">Creator workspace</p>
          <h1>Your stories, in progress.</h1>
          <p>
            Campaigns deployed by your connected wallet, read from Arc Testnet.
          </p>
        </div>
        <Link
          className="hover:border-[#e4ff1a] hover:bg-[#e4ff1a] inline-flex items-center justify-center rounded-lg border border-[#d3ed05] bg-[#d3ed05] px-5 py-[13px] text-xs font-bold text-black transition"
          href="/create"
        >
          Create a campaign
        </Link>
      </div>
      <WalletDashboard mode="creator" />
      <ListingsManager />
    </AppShell>
  );
}
