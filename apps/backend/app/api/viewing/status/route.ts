import { NextResponse } from "next/server";
import { zeroAddress } from "viem";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { readCampaignMedia } from "@/lib/media/arc";
import { playableUpload } from "@/lib/media/release";
import { readViewingChain } from "@/lib/viewing/arc";
import { filmInput, headers, viewingFailure } from "@/lib/viewing/http";
import { BLOCK_SECONDS } from "@/lib/viewing/ledger";
import { accountView, readAccount } from "@/lib/viewing/service";

const schema = z.object(filmInput).strict();

/** Public pricing facts, plus the ledger of the signed-in wallet when there is one. */
export async function GET(request: Request) {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers });
  const { arcChainId, campaignAddress: campaign } = parsed.data;
  try {
    const media = await readCampaignMedia(campaign);
    if (!media?.released) return NextResponse.json({ metered: false }, { headers });
    const [chain, upload, session] = await Promise.all([
      readViewingChain(campaign, zeroAddress), playableUpload(arcChainId, campaign, media.onchainHash), getSession(request),
    ]);
    if (!chain.metered || !upload?.durationSeconds) return NextResponse.json({ metered: false }, { headers });
    const row = session ? await readAccount({ arcChainId, campaign, wallet: session.address as `0x${string}` }) : undefined;
    return NextResponse.json({
      metered: true, durationSeconds: upload.durationSeconds, blockSeconds: BLOCK_SECONDS,
      price: media.watchPrice.toString(), account: row ? accountView(row) : null,
    }, { headers });
  } catch (error) { return viewingFailure(error); }
}
