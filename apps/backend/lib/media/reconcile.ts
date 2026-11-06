import "server-only";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/lib/db";
import { mediaUploads } from "@/lib/db/schema";
import { getAsset } from "./livepeer";
import { isTerminal, phaseToStatus, transition } from "./status";

export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;
export const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"] as const;

type Upload = typeof mediaUploads.$inferSelect;

/**
 * Idempotent provider reconciliation, safe to call from any poller or retry. Provider errors leave
 * the stored state unchanged (stale=true); transitions are compare-and-set, so concurrent
 * or duplicate runs converge on one monotonic status and can never produce conflicting ready states.
 */
export async function reconcileUpload(row: Upload): Promise<{ row: Upload; stale: boolean }> {
  if (isTerminal(row.status) || !row.providerAssetId) return { row, stale: false };
  const db = createDatabase();
  try {
    const asset = await getAsset(row.providerAssetId);
    let to = phaseToStatus(asset.phase);
    // Provider-reported size is the enforceable limit for direct browser uploads.
    if (asset.size !== null && asset.size > MAX_UPLOAD_BYTES) to = "failed";
    if (to === "ready" && !asset.playbackId) return { row, stale: true };
    if (to !== row.status) await transition(db, row.id, to, to === "ready" ? { playbackId: asset.playbackId } : {});
    const [fresh] = await db.select().from(mediaUploads).where(eq(mediaUploads.id, row.id)).limit(1);
    return { row: fresh ?? row, stale: false };
  } catch {
    return { row, stale: true };
  }
}
