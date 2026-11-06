import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { AppShell } from "@/components/shell/app-shell";
import { UnsupportedNetwork } from "@/components/campaign/unsupported-network";
import { LiveCampaign } from "@/components/campaign/live-campaign";
import { ARC_TESTNET } from "@/lib/chain";

/** Canonical live-campaign route. Chain and address are validated server-side. */
export default async function FilmPage({
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
      <LiveCampaign campaign={address} />
    </AppShell>
  );
}
