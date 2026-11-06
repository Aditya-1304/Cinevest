import { and, eq, inArray } from "drizzle-orm";
import type { createDatabase } from "@/lib/db";
import { mediaUploads } from "@/lib/db/schema";

export type MediaStatus = "pending" | "uploading" | "processing" | "ready" | "failed";

/** Finite state machine: each status lists the only statuses it may be entered from. `ready` and `failed` are terminal. */
const enteredFrom: Record<MediaStatus, MediaStatus[]> = {
  pending: [],
  uploading: ["pending"],
  processing: ["pending", "uploading"],
  ready: ["pending", "uploading", "processing"],
  failed: ["pending", "uploading", "processing"],
};

export const isTerminal = (status: string) => status === "ready" || status === "failed";

export function phaseToStatus(phase: string): MediaStatus {
  if (phase === "ready") return "ready";
  if (phase === "processing") return "processing";
  if (phase === "waiting") return "uploading";
  return "failed"; // failed, deleting, deleted or any unknown provider phase fails closed
}

/**
 * Compare-and-set transition. Duplicate callbacks, concurrent pollers and stale reads lose the
 * race instead of regressing or conflicting; returns the updated row, or null if not applied.
 */
export async function transition(
  db: ReturnType<typeof createDatabase>,
  id: string,
  to: MediaStatus,
  patch: { playbackId?: string | null } = {},
) {
  const [row] = await db.update(mediaUploads)
    .set({ ...patch, status: to, updatedAt: new Date(), ...(to === "uploading" ? {} : { uploadUrl: null, tusEndpoint: null }) })
    .where(and(eq(mediaUploads.id, id), inArray(mediaUploads.status, enteredFrom[to])))
    .returning();
  return row ?? null;
}
