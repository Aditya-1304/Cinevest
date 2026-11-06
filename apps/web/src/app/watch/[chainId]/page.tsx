import { notFound, redirect } from "next/navigation";
import { isAddress } from "viem";
import { watchPath } from "@/lib/paths";

// Legacy one-segment link: a bare contract address redirects to the canonical route.
export default async function LegacyWatchPage({
  params,
}: {
  params: Promise<{ chainId: string }>;
}) {
  const { chainId: segment } = await params;
  if (isAddress(segment)) redirect(watchPath(segment));
  notFound();
}
