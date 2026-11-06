import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { createDatabase } from "../db";
import { workflowOperations } from "../db/schema";
import type {
  OperationStatus,
  TransitionInput,
  WorkflowOperation,
  WorkflowStore,
} from "./publication";

type Row = typeof workflowOperations.$inferSelect;

function toOperation(row: Row): WorkflowOperation {
  return {
    id: row.id,
    actor: row.actor,
    arcChainId: row.arcChainId,
    campaignAddress: row.campaignAddress,
    requestDigest: row.requestDigest,
    termsJson: row.termsJson,
    swarmReference: row.swarmReference,
    arcTxHash: row.arcTxHash,
    arkivTxHash: row.arkivTxHash,
    arkivEntityId: row.arkivEntityId,
    status: row.status as OperationStatus,
    retryCount: row.retryCount,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Every status change is one compare-and-set update, so a concurrent retry loses cleanly. */
export function createWorkflowStore(db = createDatabase()): WorkflowStore {
  return {
    async insert(operation) {
      const [row] = await db
        .insert(workflowOperations)
        .values(operation)
        .onConflictDoNothing()
        .returning();
      return row ? toOperation(row) : null;
    },
    async find(actor, requestDigest) {
      const [row] = await db
        .select()
        .from(workflowOperations)
        .where(
          and(
            eq(workflowOperations.actor, actor),
            eq(workflowOperations.requestDigest, requestDigest),
          ),
        )
        .limit(1);
      return row ? toOperation(row) : null;
    },
    async transition(input: TransitionInput) {
      const [row] = await db
        .update(workflowOperations)
        .set({
          ...input.patch,
          status: input.next,
          revision: sql`${workflowOperations.revision} + 1`,
          updatedAt: new Date(),
          ...(input.incrementRetry
            ? { retryCount: sql`${workflowOperations.retryCount} + 1` }
            : {}),
        })
        .where(
          and(
            eq(workflowOperations.id, input.id),
            eq(workflowOperations.actor, input.actor),
            eq(workflowOperations.status, input.expected),
            eq(workflowOperations.revision, input.expectedRevision),
          ),
        )
        .returning();
      return row ? toOperation(row) : null;
    },
  };
}
