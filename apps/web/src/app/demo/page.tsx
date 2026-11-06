import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { demoFilms } from "@/lib/demo-films";
import { demoFilmPath, demoWatchPath } from "@/lib/paths";
import { ARC_TESTNET, ARC_TESTNET_DEPLOYMENT } from "@/lib/chain";

export default function DemoPage() {
  const factory = ARC_TESTNET_DEPLOYMENT.factoryAddress;
  return (
    <AppShell>
      <div className="mb-10 block gap-6 min-[761px]:flex min-[761px]:items-end min-[761px]:justify-between [&_p]:mb-0">
        <div>
          <p className="text-xs font-bold !text-[#d3ed05]">Preview guide</p>
          <h1>Explore the Cinevest flow.</h1>
          <p>
            Campaign creation, funding and milestone claims run live on Arc
            Testnet. The example films below are fictional previews.
          </p>
          <p>How to try it:</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-white/70 [&_a]:font-semibold [&_a]:text-[#d3ed05] [&_a:hover]:text-[#e4ff1a]">
            <li>
              Get test USDC from the{" "}
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                Circle faucet ↗
              </a>
              .
            </li>
            <li>
              <Link className="font-semibold text-[#d3ed05] hover:text-[#e4ff1a]" href="/create">
                Create a campaign
              </Link>{" "}
              on Arc Testnet.
            </li>
            <li>
              Back a campaign on its{" "}
              <Link className="font-semibold text-[#d3ed05] hover:text-[#e4ff1a]" href={demoFilmPath(demoFilms[0].id)}>
                campaign page
              </Link>{" "}
              and watch your receipts accrue.
            </li>
          </ol>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 min-[761px]:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-[#04141C] p-7 [&_p]:text-sm [&_p]:text-white/70">
          <h2>Funding a film</h2>
          <p>Explore an example campaign and its funding terms.</p>
          <Link
            className="text-[#d3ed05] hover:text-[#e4ff1a] mt-[15px] inline-block text-[13px] font-bold"
            href={demoFilmPath(demoFilms[0].id)}
          >
            Open funding example →
          </Link>
        </section>
        <section className="rounded-2xl border border-white/10 bg-[#04141C] p-7 [&_p]:text-sm [&_p]:text-white/70">
          <h2>Watching a film</h2>
          <p>See the planned viewing and access experience.</p>
          <Link
            className="text-[#d3ed05] hover:text-[#e4ff1a] mt-[15px] inline-block text-[13px] font-bold"
            href={demoWatchPath(demoFilms[1].id)}
          >
            Open viewing example →
          </Link>
        </section>
        <section className="rounded-2xl border border-white/10 bg-[#04141C] p-7 [&_p]:text-sm [&_p]:text-white/70">
          <h2>Creator and backer</h2>
          <p>Review the production and claims workspaces.</p>
          <Link
            className="text-[#d3ed05] hover:text-[#e4ff1a] mt-[15px] inline-block text-[13px] font-bold"
            href="/dashboard/creator"
          >
            Creator dashboard →
          </Link>
          <br />
          <Link
            className="text-[#d3ed05] hover:text-[#e4ff1a] mt-[15px] inline-block text-[13px] font-bold"
            href="/dashboard/backer"
          >
            Backer dashboard →
          </Link>
        </section>
        <section className="rounded-2xl border border-white/10 bg-[#04141C] p-7 [&_p]:text-sm [&_p]:text-white/70">
          <h2>Supported wallets</h2>
          <p>
            EOA browser wallets (for example MetaMask or Rabby) are fully
            supported on Arc Testnet.
          </p>
          <p className="mt-[10px]">
            Smart-contract wallets can sign Arc Testnet transactions, but they
            are not supported for creator-owned Arkiv listings yet.
          </p>
          <p className="mt-[10px]">
            Mobile wallets and WalletConnect are not supported yet. The app runs
            on Arc Testnet only.
          </p>
        </section>
        <section className="rounded-2xl border border-white/10 bg-[#04141C] p-7 [&_a]:break-all [&_a]:text-[#d3ed05] [&_a:hover]:text-[#e4ff1a] [&_a]:font-bold [&_a]:text-[13px] [&_p]:text-sm [&_p]:text-white/70">
          <h2>Network information</h2>
          <p>
            Settlement runs on Arc Testnet. Campaigns are deployed by the
            factory at{" "}
            <a
              href={`${ARC_TESTNET.blockExplorers.default.url}/address/${factory}`}
              target="_blank"
              rel="noreferrer"
            >
              {factory}
            </a>
            .
          </p>
          <p className="mt-[15px]">Test USDC faucet:</p>
          <a
            className="mt-[5px] inline-block text-[13px] font-bold"
            href="https://faucet.circle.com"
            target="_blank"
            rel="noreferrer"
          >
            faucet.circle.com ↗
          </a>
          <br />
          <a
            className="mt-[15px] inline-block text-[13px] font-bold"
            href={ARC_TESTNET.blockExplorers.default.url}
            target="_blank"
            rel="noreferrer"
          >
            Arc Testnet explorer ↗
          </a>
        </section>
      </div>
    </AppShell>
  );
}
