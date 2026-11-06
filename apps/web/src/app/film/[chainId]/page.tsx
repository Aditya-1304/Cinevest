import { notFound, redirect } from "next/navigation";
import { isAddress } from "viem";
import { filmPath } from "@/lib/paths";

// Legacy one-segment link: a bare contract address redirects to the canonical route.
export default async function LegacyFilmPage({
  params,
}: {
  params: Promise<{ chainId: string }>;
}) {
  const { chainId: segment } = await params;
  if (isAddress(segment)) redirect(filmPath(segment));
  notFound();
}
