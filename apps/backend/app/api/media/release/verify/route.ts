import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth/session";
import { readCampaignMedia } from "@/lib/media/arc";
import { arcChainId, campaignAddress } from "@/lib/media/input";
import { verifyRelease } from "@/lib/media/verify-release";

const querySchema = z.object({ arcChainId, campaignAddress });

/** Creator/reviewer-only readiness check the final-review UI must pass before enabling approval. */
export async function GET(request: Request) {
  const session = await authenticate(request);
  if (session instanceof NextResponse) return session;
  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse({ arcChainId: params.get("arcChainId"), campaignAddress: params.get("campaignAddress") });
  if (!query.success) return NextResponse.json({ error: "Invalid release query" }, { status: 400 });
  try {
    const campaign = await readCampaignMedia(query.data.campaignAddress);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (session.address !== campaign.creator && session.address !== campaign.reviewer) {
      return NextResponse.json({ error: "Only the creator or reviewer may verify the release" }, { status: 403 });
    }
    return NextResponse.json(await verifyRelease(query.data.arcChainId, query.data.campaignAddress, campaign.onchainHash), { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Release verification unavailable", retryable: true }, { status: 503 }); }
}
