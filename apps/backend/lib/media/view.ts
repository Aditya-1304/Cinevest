import type { mediaUploads } from "@/lib/db/schema";

/** Owner-facing upload shape; upload URLs are present only while the attempt can still resume. */
export function uploadView(row: typeof mediaUploads.$inferSelect, stale = false) {
  return {
    id: row.id, attemptKey: row.attemptKey, status: row.status, stale,
    uploadUrl: row.status === "uploading" ? row.uploadUrl : null,
  };
}
