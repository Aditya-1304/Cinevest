import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { createDatabase } from "@/lib/db";
import { mediaUploads } from "@/lib/db/schema";
import { getAsset, getUpload } from "./mux";
import { isTerminal, transition, type MediaStatus } from "./status";

export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;
export const MAX_DURATION_SECONDS = 4 * 60 * 60;
export const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"] as const;

type Upload = typeof mediaUploads.$inferSelect;

/** Unknown provider asset states fail closed. */
function assetStatus(status: string): MediaStatus {
  if (status === "ready") return "ready";
  if (status === "preparing") return "processing";
  return "failed";
}

/**
 * Idempotent provider reconciliation, safe to call from any poller or retry. Mux creates the asset only
 * when the file arrives, so the upload is checked first and the asset ID is recorded once it appears.
 * Provider errors leave the stored state unchanged (stale=true); transitions are compare-and-set, so
 * concurrent or duplicate runs converge on one monotonic status and can never produce conflicting ready states.
 */
export async function reconcileUpload(row: Upload): Promise<{ row: Upload; stale: boolean }> {
  if (isTerminal(row.status) || !row.providerUploadId) return { row, stale: false };
  const db = createDatabase();
  const reload = async () => ({ row: (await db.select().from(mediaUploads).where(eq(mediaUploads.id, row.id)).limit(1))[0] ?? row, stale: false });
  try {
    let assetId = row.providerAssetId;
    if (!assetId) {
      const upload = await getUpload(row.providerUploadId);
      if (upload?.status === "waiting") return { row, stale: false };
      if (!upload?.assetId) { await transition(db, row.id, "failed"); return reload(); }
      await db.update(mediaUploads).set({ providerAssetId: upload.assetId }).where(and(eq(mediaUploads.id, row.id), isNull(mediaUploads.providerAssetId)));
      assetId = upload.assetId;
    }
    const asset = await getAsset(assetId);
    let to = asset ? assetStatus(asset.status) : "failed";
    // Duration is the enforceable limit for direct browser uploads (Mux reports no file size).
    if (asset?.duration != null && asset.duration > MAX_DURATION_SECONDS) to = "failed";
    if (to === "ready" && !asset?.signedPlaybackId) return { row, stale: true };
    if (to !== row.status) {
      await transition(db, row.id, to, to === "ready" ? { playbackId: asset?.signedPlaybackId, durationSeconds: Math.ceil(asset?.duration ?? 0) } : {});
    }
    return reload();
  } catch {
    return { row, stale: true };
  }
}
