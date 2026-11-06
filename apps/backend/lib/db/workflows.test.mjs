import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createWorkflowStore } from "../workflows/store.ts";
import { beginPublication, recordArcTransaction } from "../workflows/publication.ts";

test("PostgreSQL migrations enforce uniqueness and revision-based atomic journal updates", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg);
    const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
    await migrate(db, { migrationsFolder });
    await migrate(db, { migrationsFolder });
    const store = createWorkflowStore(db);
    const input = { id: "00000000-0000-4000-8000-000000000001", actor: `0x${"11".repeat(20)}`, arcChainId: 5042002, requestDigest: "ab".repeat(32) };
    const first = await beginPublication(store, input);
    assert.equal(first.created, true);
    assert.equal((await beginPublication(store, { ...input, id: "00000000-0000-4000-8000-000000000002" })).created, false);
    const transition = { id: first.operation.id, actor: input.actor, expected: "pending", expectedRevision: 0, next: "submitted", patch: { arcTxHash: `0x${"22".repeat(32)}` } };
    const results = await Promise.all([store.transition(transition), store.transition(transition)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await store.find(input.actor, input.requestDigest)).revision, 1);
    await assert.rejects(recordArcTransaction(store, { ...input, id: "00000000-0000-4000-8000-000000000003", requestDigest: "cd".repeat(32), arcTxHash: transition.patch.arcTxHash }));
    await assert.rejects(beginPublication(store, { ...input, arcChainId: 1, requestDigest: "ef".repeat(32), id: "00000000-0000-4000-8000-000000000004" }));
  } finally { await pg.close(); }
});
