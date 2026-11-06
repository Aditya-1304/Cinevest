import { getAddress, isAddress } from "viem";
import { ARC_TESTNET } from "@/lib/chain";

/**
 * Single source of campaign URLs. Live contracts are served only from the
 * canonical /film|watch/[chainId]/[campaign] routes; fictional demo slugs
 * live under /demo.
 */
export function demoFilmPath(slug: string) {
  return `/demo/film/${slug}`;
}

export function demoWatchPath(slug: string) {
  return `/demo/watch/${slug}`;
}

export function filmPath(campaign: string) {
  return isAddress(campaign)
    ? `/film/${ARC_TESTNET.id}/${getAddress(campaign)}`
    : demoFilmPath(campaign);
}

export function watchPath(campaign: string) {
  return isAddress(campaign)
    ? `/watch/${ARC_TESTNET.id}/${getAddress(campaign)}`
    : demoWatchPath(campaign);
}
