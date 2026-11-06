import { type Address } from "viem";
import { ARC_TESTNET } from "@/lib/chain";

export type ViewingAccount = {
  positionSeconds: number;
  watchedSeconds: number;
  fundedSeconds: number;
  charged: string;
  reserved: string;
  settled: string;
  exitAt: string | null;
  active: boolean;
};

export type ViewingStatus =
  | { metered: false }
  | { metered: true; durationSeconds: number; blockSeconds: number; price: string; account: ViewingAccount | null };

/** Same-origin calls so the HttpOnly SIWE cookie authenticates both JSON routes and media requests. */
export function postViewing(route: "session" | "heartbeat" | "close", campaign: Address, body: object = {}) {
  return fetch(`/api/viewing/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ arcChainId: String(ARC_TESTNET.id), campaignAddress: campaign, ...body }),
  });
}

export async function fetchViewingStatus(campaign: Address): Promise<ViewingStatus> {
  const query = new URLSearchParams({ arcChainId: String(ARC_TESTNET.id), campaignAddress: campaign });
  const response = await fetch(`/api/viewing/status?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Viewing status unavailable");
  return response.json();
}

export const viewingManifest = (campaign: Address, sessionId: string) =>
  `/api/viewing/media/${ARC_TESTNET.id}/${campaign}/${sessionId}/master.m3u8`;
