import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { authenticate } from "@/lib/auth/session";
import { createDatabase } from "@/lib/db";
import { mediaUploads } from "@/lib/db/schema";
import { reconcileUpload } from "@/lib/media/reconcile";
import { uploadView } from "@/lib/media/view";

/** Owner-only status poll: reconciles with Mux each call and reports the real processing state. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await authenticate(request);
  if (session instanceof NextResponse) return session;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid upload id" }, { status: 400 });
  try {
    const [row] = await createDatabase().select().from(mediaUploads).where(eq(mediaUploads.id, id)).limit(1);
    if (!row || row.ownerWallet !== session.address) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    const { row: fresh, stale } = await reconcileUpload(row);
    return NextResponse.json(uploadView(fresh, stale), { headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ error: "Upload status unavailable", retryable: true }, { status: 503 }); }
}
