/** One bounded recovery pass; all writes use the existing revision-checked journal transitions. */
import { logEvent } from "../log";
import { isAddress } from "viem";

export async function reconcilePublications(limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be 1–100");
  let failed = 0;
  const [{ createDatabase }, { workflowOperations }, { inArray, asc }, { createWorkflowStore }, workflow, { createArcConfirmation }, { findOwnedFilmEntity }] = await Promise.all([
    import("../db/index"), import("../db/schema"), import("drizzle-orm"),
    import("./store"), import("./publication"),
    import("./arc-adapter"), import("../arkiv/verify-entity"),
  ]);
  const rows = await createDatabase().select().from(workflowOperations)
    .where(inArray(workflowOperations.status, ["submitted", "uncertain", "confirmed", "publishing"]))
    .orderBy(asc(workflowOperations.updatedAt), asc(workflowOperations.id)).limit(limit);
  const store = createWorkflowStore();
  for (const row of rows) {
    try {
      let operation = row;
      if (["submitted", "uncertain"].includes(row.status) && row.arcTxHash) {
        const confirmation = await createArcConfirmation({ expectedTerms: row.termsJson ? JSON.parse(row.termsJson) : null })({ arcTxHash: row.arcTxHash, actor: row.actor, campaignAddress: row.campaignAddress });
        operation = await workflow.recordArcConfirmation(store, row.actor, row.requestDigest, confirmation);
      }
      if (["confirmed", "publishing"].includes(operation.status) && operation.campaignAddress) {
        if (!isAddress(operation.campaignAddress)) throw new Error("Invalid recorded campaign address");
        const entity = await findOwnedFilmEntity({ actor: operation.actor, campaignAddress: operation.campaignAddress, requestDigest: operation.requestDigest });
        if (entity) {
          await workflow.beginArkivPublication(store, operation.actor, operation.requestDigest);
          operation = await workflow.completeArkivPublication(store, operation.actor, operation.requestDigest, entity);
        }
      }
      logEvent("info", "publication.reconciled", { op: operation.id, campaign: operation.campaignAddress ?? undefined, status: operation.status });
    } catch (error) {
      logEvent("error", "publication.reconcile_failed", { op: row.id, campaign: row.campaignAddress ?? undefined, error: error instanceof Error ? error.message : String(error) });
      failed += 1;
    }
  }

  return { examined: rows.length, failed };
}
