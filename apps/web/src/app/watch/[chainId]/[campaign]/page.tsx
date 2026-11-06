import Link from "next/link";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { AppShell } from "@/components/shell/app-shell";
import { AddressLink } from "@/components/campaign/address-link";
import { UnsupportedNetwork } from "@/components/campaign/unsupported-network";
import { ARC_TESTNET } from "@/lib/chain";
import { filmPath } from "@/lib/paths";

/**
 * Canonical watch route for live campaigns. Viewing access (Arkiv) arrives in a
 * later phase, so this page is informational and renders no purchase actions.
 */
export default async function WatchPage({
  params,
}: {
  params: Promise<{ chainId: string; campaign: string }>;
}) {
  const { chainId, campaign } = await params;
  if (chainId !== String(ARC_TESTNET.id))
    return <UnsupportedNetwork chainId={chainId} />;
  if (!isAddress(campaign)) notFound();
  const address = getAddress(campaign);
  return (
    <AppShell compact>
      <Link
        className="text-[#d3ed05] hover:text-[#e4ff1a] mb-4 inline-block text-sm font-bold"
        href={filmPath(address)}
      >
        ← Back to campaign
      </Link>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,.75fr)]">
        <div>
          <div className="rounded-2xl border border-white/10 relative flex aspect-video max-h-[52vh] min-h-[240px] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_100%,#072733_0%,#04141c_55%,#01060f_100%)] p-6 text-center text-white shadow-[0_24px_80px_rgba(0,0,0,.3)] [&_p]:text-white/70 [&_span]:text-xs [&_span]:font-bold [&_span]:tracking-[.2em] [&_span]:text-[#d3ed05] [&_strong]:mt-4 [&_strong]:text-xl">
            <span>SECURE VIEWING UNLOCKS LATER</span>
            <strong>Playback is not available yet</strong>
            <p>
              Watching and per-view payment arrive in a later phase. No purchase
              actions are available on this page.
            </p>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold tracking-[.16em] text-[#d3ed05] uppercase">
              Live campaign on {ARC_TESTNET.name}
            </p>
          </div>
        </div>
        <aside className="rounded-2xl border border-white/10 bg-[#04141C] p-5 shadow-[0_18px_60px_rgba(0,0,0,.3)] [&_p]:text-sm [&_p]:text-white/70">
          <p className="text-[#d3ed05] text-xs font-bold !text-[#d3ed05]">
            Viewing access
          </p>
          <h2>Watch this film</h2>
          <p>
            Campaign contract: <AddressLink address={address} />
          </p>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 text-xs font-bold text-white/60"
            disabled
          >
            Purchase access unavailable
          </button>
          <p className="mt-4 !text-xs">
            Wallet sign-in, payment and playback authorization are not connected
            to live campaigns yet. No access can be purchased on this page.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
