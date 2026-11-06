import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { queryFilmDetail } from "@/lib/arkiv/film-detail";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ arcChainId: string; campaignAddress: string }> },
) {
  const { arcChainId: chainText, campaignAddress } = await params;
  if (!/^\d{1,12}$/.test(chainText) || !isAddress(campaignAddress)) {
    return NextResponse.json({ error: "Invalid campaign identity" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await queryFilmDetail(Number(chainText), campaignAddress),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign detail is unavailable";
    const status = message === "Campaign is not registered with the configured factory"
      ? 404
      : message === "Unsupported Arc chain"
        ? 400
        : 503;
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
