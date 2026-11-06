import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { createDatabase } from "@/lib/db";
import { mediaUploads } from "@/lib/db/schema";
import { createUpload } from "./mux";

const MAX_ATTEMPTS_PER_CAMPAIGN = 10;

type Upload = typeof mediaUploads.$inferSelect;
type Identity = { arcChainId: string; campaignAddress: string; ownerWallet: string; attemptKey: string };

export class UploadError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/**
 * Starts or resumes one upload attempt. The attempt row is persisted before the provider is called
 * and the provider upload ID is persisted before the direct-upload URL is returned, so a lost
 * response or interrupted browser re-enters here with the same attemptKey instead of duplicating work.
 */
export async function startUpload(input: Identity): Promise<Upload> {
  const db = createDatabase();
  const find = async () => (await db.select().from(mediaUploads).where(eq(mediaUploads.attemptKey, input.attemptKey)).limit(1))[0];
  let row = await find();
  if (!row) {
    const [{ attempts }] = await db.select({ attempts: count() }).from(mediaUploads).where(and(
      eq(mediaUploads.arcChainId, input.arcChainId), eq(mediaUploads.campaignAddress, input.campaignAddress), eq(mediaUploads.ownerWallet, input.ownerWallet)));
    if (attempts >= MAX_ATTEMPTS_PER_CAMPAIGN) throw new UploadError(429, "Too many upload attempts for this campaign");
    await db.insert(mediaUploads).values({ ...input, status: "pending" }).onConflictDoNothing({ target: mediaUploads.attemptKey });
    row = await find();
  }
  if (!row || row.ownerWallet !== input.ownerWallet || row.campaignAddress !== input.campaignAddress || row.arcChainId !== input.arcChainId) {
    throw new UploadError(409, "Upload attempt key is already in use");
  }
  if (row.status !== "pending" || row.providerUploadId) return row; // resume: uploading rows still hold their URL
  const upload = await createUpload(row.id);
  // CAS on providerUploadId: a concurrent request for the same attempt wins once; the loser's orphan upload is never used.
  const [saved] = await db.update(mediaUploads).set({
    providerUploadId: upload.uploadId, uploadUrl: upload.url, status: "uploading", updatedAt: new Date(),
  }).where(and(eq(mediaUploads.id, row.id), isNull(mediaUploads.providerUploadId), eq(mediaUploads.status, "pending"))).returning();
  return saved ?? (await find()) ?? row;
}
