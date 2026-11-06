import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { config } from "dotenv";

// The CLI uses Node's TypeScript stripping with the same app aliases as Next.js.
const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({ resolve(specifier, context, nextResolve) {
  const base = specifier.startsWith("@/") ? pathToFileURL(resolve(root, specifier.slice(2))).href
    : specifier.startsWith(".") && context.parentURL ? new URL(specifier, context.parentURL).href : null;
  if (base) for (const suffix of [".ts", "/index.ts"]) {
    if (existsSync(fileURLToPath(base + suffix))) return nextResolve(base + suffix, context);
  }
  return nextResolve(specifier, context);
} });
config({ path: resolve(root, ".env.local"), quiet: true });
const limit = Number(process.argv[2] ?? 20);
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be 1–100");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const [{ createDatabase }, { workflowOperations }, { inArray, asc }, { createWorkflowStore }, workflow, { createArcConfirmation }, { findOwnedFilmEntity }] = await Promise.all([
  import("../lib/db/index.ts"), import("../lib/db/schema.ts"), import("drizzle-orm"),
  import("../lib/workflows/store.ts"), import("../lib/workflows/publication.ts"),
  import("../lib/workflows/arc-adapter.ts"), import("../lib/arkiv/verify-entity.ts"),
]);
const rows = await createDatabase().select().from(workflowOperations)
  .where(inArray(workflowOperations.status, ["pending", "uploaded", "submitted", "uncertain", "confirmed", "publishing"]))
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
      const entity = await findOwnedFilmEntity({ actor: operation.actor, campaignAddress: operation.campaignAddress, requestDigest: operation.requestDigest });
      if (entity) {
        await workflow.beginArkivPublication(store, operation.actor, operation.requestDigest);
        operation = await workflow.completeArkivPublication(store, operation.actor, operation.requestDigest, entity);
      }
    }
    console.log(JSON.stringify({ id: operation.id, status: operation.status }));
  } catch (error) {
    console.error(JSON.stringify({ id: row.id, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}
