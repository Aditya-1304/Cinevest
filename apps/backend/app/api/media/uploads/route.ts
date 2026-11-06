import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth/session";
import { readJson } from "@/lib/http";
import { arcChainId, campaignAddress } from "@/lib/media/input";
import { readCampaignMedia } from "@/lib/media/arc";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/media/reconcile";
import { startUpload, UploadError } from "@/lib/media/uploads";
import { uploadView } from "@/lib/media/view";

const schema = z.object({
  arcChainId, campaignAddress,
  attemptKey: z.uuid(),
  contentType: z.enum(ALLOWED_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
}).strict();

/**
 * Creator-only: starts or resumes a direct-to-Mux upload attempt. Retrying with the same
 * attemptKey returns the same attempt, so the browser can recover without re-uploading through Next.js.
 */
export async function POST(request: Request) {
  const session = await authenticate(request);
  if (session instanceof NextResponse) return session;
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await readJson(request, 4096)); }
  catch { return NextResponse.json({ error: "Invalid upload request" }, { status: 400 }); }
  try {
    const campaign = await readCampaignMedia(input.campaignAddress);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (campaign.creator !== session.address) return NextResponse.json({ error: "Only the campaign creator may upload" }, { status: 403 });
    const row = await startUpload({ arcChainId: input.arcChainId, campaignAddress: input.campaignAddress, ownerWallet: session.address, attemptKey: input.attemptKey });
    return NextResponse.json(uploadView(row), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Upload is temporarily unavailable", retryable: true }, { status: 503 });
  }
}
