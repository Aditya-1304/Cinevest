import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { AppShell } from "@/components/shell/app-shell";
import { ARC_TESTNET } from "@/lib/chain";

export default async function WorldPage({ params }: { params: Promise<{ chainId: string; campaign: string }> }) {
  const { chainId, campaign } = await params;
  if (chainId !== String(ARC_TESTNET.id) || !isAddress(campaign)) notFound();
  return <AppShell compact><p>World verification is retired. New Cinevest campaigns use public funding and Chainlink CRE release review. Existing World funding gates cannot be changed.</p></AppShell>;
}
