import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { AppShell } from "@/components/shell/app-shell";
import { WorldChallenge } from "@/components/world/world-challenge";
import { ARC_TESTNET } from "@/lib/chain";

export default async function WorldPage({ params }: { params: Promise<{ chainId: string; campaign: string }> }) {
  const { chainId, campaign } = await params;
  if (chainId !== String(ARC_TESTNET.id) || !isAddress(campaign)) notFound();
  return <AppShell compact><WorldChallenge campaign={campaign.toLowerCase()} /></AppShell>;
}
