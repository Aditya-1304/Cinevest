import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { encodeEventTopics } from "viem";
import { getTableColumns } from "drizzle-orm";
import { workflowOperations } from "../db/schema.ts";
import {
  beginArkivPublication,
  beginPublication,
  findPublication,
  recordArkivTransaction,
  recordArcConfirmation,
  recordArcTransaction,
  retryFailedArkivPublication,
  runPublication,
  PublicationConflictError,
  PublicationStateError,
} from "./publication.ts";
import { campaignCreatedEvent, findCreatedCampaign } from "./arc-reconcile.ts";

const ACTOR = `0x${"11".repeat(20)}`;
const CAMPAIGN = `0x${"22".repeat(20)}`;
const FACTORY = `0x${"33".repeat(20)}`;
const HASH = `0x${"44".repeat(32)}`;
const OTHER_HASH = `0x${"45".repeat(32)}`;
const CHAIN = 5042002;
const DIGEST = `ab`.repeat(32);

/** In-memory store with the same unique keys and compare-and-set semantics as the migration. */
function createStore() {
  const rows = new Map();
  return {
    rows,
    async insert(operation) {
      const duplicate = [...rows.values()].some(
        (row) =>
          (row.actor === operation.actor &&
            row.requestDigest === operation.requestDigest) ||
          (operation.campaignAddress &&
            row.arcChainId === operation.arcChainId &&
            row.campaignAddress === operation.campaignAddress),
      );
      if (duplicate) return null;
      const row = { ...operation };
      rows.set(row.id, row);
      return { ...row };
    },
    async find(actor, requestDigest) {
      const row = [...rows.values()].find(
        (value) =>
          value.actor === actor && value.requestDigest === requestDigest,
      );
      return row ? { ...row } : null;
    },
    async transition({ id, actor, expected, next, patch, incrementRetry }) {
      const row = rows.get(id);
      if (!row || row.actor !== actor || row.status !== expected) return null;
      const updated = {
        ...row,
        ...patch,
        status: next,
        retryCount: row.retryCount + (incrementRetry ? 1 : 0),
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return { ...updated };
    },
  };
}

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  actor: ACTOR,
  arcChainId: CHAIN,
  requestDigest: DIGEST,
};

test("migration and schema expose stable workflow keys", () => {
  const sql = readFileSync(
    new URL("../../drizzle/0000_ancient_avengers.sql", import.meta.url),
    "utf8",
  );
  const followupSql = readFileSync(
    new URL("../../drizzle/0001_fast_maginty.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE "workflow_operations"/);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "workflow_actor_request_unique" ON "workflow_operations" USING btree \("actor","request_digest"\)/,
  );
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "workflow_campaign_unique" ON "workflow_operations" USING btree \("arc_chain_id","campaign_address"\)/,
  );
  const columns = getTableColumns(workflowOperations);
  for (const name of [
    "id",
    "actor",
    "arcChainId",
    "campaignAddress",
    "requestDigest",
    "termsJson",
    "swarmReference",
    "arcTxHash",
    "arkivTxHash",
    "arkivEntityId",
    "status",
    "retryCount",
    "createdAt",
    "updatedAt",
  ]) {
    assert.ok(columns[name], `missing workflow column ${name}`);
  }
  assert.match(followupSql, /ADD COLUMN "terms_json" text/);
});

test("begin is idempotent and conflicting identity is rejected", async () => {
  const store = createStore();
  const first = await beginPublication(store, base);
  const second = await beginPublication(store, base);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.operation.id, second.operation.id);
  assert.equal(store.rows.size, 1);
  await assert.rejects(
    beginPublication(store, { ...base, id: "another-id", arcChainId: 1 }),
    PublicationConflictError,
  );
});

test("status changes compare-and-set from the expected state", async () => {
  const store = createStore();
  await recordArcTransaction(store, { ...base, arcTxHash: HASH });
  const results = await Promise.allSettled([
    recordArcConfirmation(store, ACTOR, DIGEST, {
      status: "confirmed",
      campaignAddress: CAMPAIGN,
    }),
    recordArcConfirmation(store, ACTOR, DIGEST, { status: "pending" }),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  const operation = await findPublication(store, ACTOR, DIGEST);
  assert.ok(["confirmed", "uncertain"].includes(operation.status));
  const confirmed = await recordArcConfirmation(store, ACTOR, DIGEST, {
    status: "confirmed",
    campaignAddress: CAMPAIGN,
  });
  assert.equal(confirmed.campaignAddress, CAMPAIGN);

  const pendingStore = createStore();
  await beginPublication(pendingStore, {
    ...base,
    id: "00000000-0000-4000-8000-000000000002",
  });
  await assert.rejects(
    beginArkivPublication(pendingStore, ACTOR, DIGEST),
    PublicationStateError,
  );
});

test("a different Arc transaction cannot replace a recorded hash", async () => {
  const store = createStore();
  await recordArcTransaction(store, { ...base, arcTxHash: HASH });
  await assert.rejects(
    recordArcTransaction(store, { ...base, arcTxHash: OTHER_HASH }),
    PublicationConflictError,
  );
});

test("the Arc hash is journaled before receipt confirmation", async () => {
  const store = createStore();
  const calls = [];
  let observedHash = null;
  const outcome = await runPublication(
    store,
    {
      swarm: {
        upload: async () => {
          calls.push("swarm");
          return "77".repeat(32);
        },
      },
      arc: {
        deploy: async () => {
          calls.push("deploy");
          return HASH;
        },
        confirm: async () => {
          calls.push("confirm");
          observedHash = (await findPublication(store, ACTOR, DIGEST)).arcTxHash;
          return { status: "confirmed", campaignAddress: CAMPAIGN };
        },
      },
    },
    { ...base, terms: { fundingGoal: "100" }, payload: { title: "Test" } },
  );
  assert.deepEqual(calls, ["swarm", "deploy", "confirm"]);
  assert.equal(observedHash, HASH);
  assert.equal(outcome.operation.status, "confirmed");
  assert.equal(outcome.operation.swarmReference, "77".repeat(32));
  assert.equal(outcome.nextStep, "arkiv-publication");
});

test("a lost Arkiv response never deploys a second Arc campaign", async () => {
  const store = createStore();
  let deployCalls = 0;
  let publishCalls = 0;
  const dependencies = {
    arc: {
      deploy: async () => {
        deployCalls += 1;
        return HASH;
      },
      confirm: async () => ({
        status: "confirmed",
        campaignAddress: CAMPAIGN,
      }),
    },
    arkiv: {
      publish: async () => {
        publishCalls += 1;
        if (publishCalls === 1) throw new Error("Arkiv response lost");
        return { entityId: `0x${"66".repeat(32)}`, txHash: "0x" + "67".repeat(32) };
      },
      find: async () => null,
    },
  };
  const first = await runPublication(store, dependencies, { ...base, terms: {} });
  assert.equal(first.operation.status, "confirmed");
  assert.equal(first.nextStep, "arkiv-publication");
  assert.equal(first.retryable, true);
  assert.equal(first.operation.retryCount, 1);

  const second = await runPublication(store, dependencies, { ...base, terms: {} });
  assert.equal(second.operation.status, "published");
  assert.equal(second.nextStep, "complete");
  assert.equal(deployCalls, 1);
  assert.equal(publishCalls, 2);
});

test("uncertain confirmation is reconciled without a new deployment", async () => {
  const store = createStore();
  let deployCalls = 0;
  let confirmations = 0;
  const dependencies = {
    arc: {
      deploy: async () => {
        deployCalls += 1;
        return HASH;
      },
      confirm: async () => {
        confirmations += 1;
        return confirmations === 1
          ? { status: "pending" }
          : { status: "confirmed", campaignAddress: CAMPAIGN };
      },
    },
  };
  const first = await runPublication(store, dependencies, { ...base, terms: {} });
  assert.equal(first.operation.status, "uncertain");
  assert.equal(first.nextStep, "arc-confirmation");
  assert.equal(first.retryable, true);

  const second = await runPublication(store, dependencies, { ...base, terms: {} });
  assert.equal(second.operation.status, "confirmed");
  assert.equal(second.operation.campaignAddress, CAMPAIGN);
  assert.equal(deployCalls, 1);
});

test("factory CampaignCreated reconciliation selects the creator event only", async () => {
  const topics = encodeEventTopics({
    abi: [campaignCreatedEvent],
    eventName: "CampaignCreated",
    args: { creator: ACTOR, campaign: CAMPAIGN },
  });
  const logs = [
    { address: `0x${"55".repeat(20)}`, topics, data: "0x" },
    { address: FACTORY, topics, data: "0x" },
  ];
  assert.equal(findCreatedCampaign(logs, FACTORY, ACTOR), CAMPAIGN);
  assert.equal(
    findCreatedCampaign(logs, FACTORY, `0x${"99".repeat(20)}`),
    null,
  );
  assert.equal(findCreatedCampaign(logs, FACTORY, ACTOR), CAMPAIGN);
  assert.equal(
    findCreatedCampaign(logs, `0x${"54".repeat(20)}`, ACTOR),
    null,
  );
});

test("recordArcTransaction journals the signed intended terms once", async () => {
  const store = createStore();
  const termsJson = JSON.stringify({ creator: ACTOR, funderBps: 5000 });
  const recorded = await recordArcTransaction(store, {
    ...base,
    arcTxHash: HASH,
    termsJson,
  });
  assert.equal(recorded.termsJson, termsJson);
  await assert.rejects(
    recordArcTransaction(store, {
      ...base,
      id: "second",
      arcTxHash: OTHER_HASH,
      termsJson: JSON.stringify({ creator: ACTOR, funderBps: 6000 }),
    }),
    (error) =>
      error instanceof PublicationStateError ||
      error instanceof PublicationConflictError,
  );
  const unchanged = await findPublication(store, ACTOR, DIGEST);
  assert.equal(unchanged.termsJson, termsJson);
});

test("the Arkiv write is journaled before its receipt is trusted", async () => {
  const store = createStore();
  await recordArcTransaction(store, { ...base, arcTxHash: HASH });
  await recordArcConfirmation(store, ACTOR, DIGEST, {
    status: "confirmed",
    campaignAddress: CAMPAIGN,
  });
  const journaled = await recordArkivTransaction(store, {
    actor: ACTOR,
    requestDigest: DIGEST,
    arkivTxHash: OTHER_HASH,
  });
  assert.equal(journaled.status, "publishing");
  assert.equal(journaled.arkivTxHash, OTHER_HASH);
  assert.equal(journaled.retryCount, 0);

  const same = await recordArkivTransaction(store, {
    actor: ACTOR,
    requestDigest: DIGEST,
    arkivTxHash: OTHER_HASH,
  });
  assert.equal(same.status, "publishing");
  await assert.rejects(
    recordArkivTransaction(store, {
      actor: ACTOR,
      requestDigest: DIGEST,
      arkivTxHash: `0x${"46".repeat(32)}`,
      arkivEntityId: `0x${"66".repeat(32)}`,
    }),
    PublicationConflictError,
  );
  const entityId = `0x${"66".repeat(32)}`;
  const keyed = await recordArkivTransaction(store, {
    actor: ACTOR,
    requestDigest: DIGEST,
    arkivEntityId: entityId,
  });
  assert.equal(keyed.arkivEntityId, entityId);
  assert.equal(keyed.arkivTxHash, OTHER_HASH);
  // The confirmed campaign identity is immutable while the Arkiv publication is journalled.
  await assert.rejects(
    recordArcConfirmation(store, ACTOR, DIGEST, {
      status: "confirmed",
      campaignAddress: `0x${"77".repeat(20)}`,
    }),
    PublicationConflictError,
  );
  const unchanged = await findPublication(store, ACTOR, DIGEST);
  assert.equal(unchanged.campaignAddress, CAMPAIGN);
  assert.equal(unchanged.arkivTxHash, OTHER_HASH);
});

test("an uncertain Arkiv write reconciles before a resubmit", async () => {
  const store = createStore();
  let publishCalls = 0;
  let finds = 0;
  const entityId = `0x${"66".repeat(32)}`;
  const dependencies = {
    arc: {
      deploy: async () => HASH,
      confirm: async () => ({ status: "confirmed", campaignAddress: CAMPAIGN }),
    },
    arkiv: {
      publish: async () => {
        publishCalls += 1;
        throw new Error("Arkiv response lost");
      },
      find: async () => {
        finds += 1;
        return finds >= 2 ? { entityId, txHash: OTHER_HASH } : null;
      },
    },
  };
  const first = await runPublication(store, dependencies, { ...base, terms: {} });
  assert.equal(first.operation.status, "confirmed");
  assert.equal(first.nextStep, "arkiv-publication");
  assert.equal(first.retryable, true);
  assert.equal(publishCalls, 1);

  const second = await runPublication(store, dependencies, { ...base, terms: {} });
  assert.equal(second.operation.status, "published");
  assert.equal(second.operation.arkivEntityId, entityId);
  assert.equal(second.operation.arkivTxHash, OTHER_HASH);
  assert.equal(publishCalls, 1);
  assert.equal(second.nextStep, "complete");
});

test("a reverted Arkiv write retries only the missing publication", async () => {
  const store = createStore();
  await recordArcTransaction(store, { ...base, arcTxHash: HASH });
  await recordArcConfirmation(store, ACTOR, DIGEST, {
    status: "confirmed",
    campaignAddress: CAMPAIGN,
  });
  await recordArkivTransaction(store, {
    actor: ACTOR,
    requestDigest: DIGEST,
    arkivTxHash: OTHER_HASH,
    arkivEntityId: `0x${"66".repeat(32)}`,
  });
  const retried = await retryFailedArkivPublication(
    store,
    ACTOR,
    DIGEST,
    OTHER_HASH,
  );
  assert.equal(retried.status, "confirmed");
  assert.equal(retried.arkivTxHash, null);
  assert.equal(retried.arkivEntityId, null);
  assert.equal(retried.retryCount, 1);

  let deployments = 0;
  const outcome = await runPublication(
    store,
    {
      arc: {
        deploy: async () => {
          deployments += 1;
          return OTHER_HASH;
        },
        confirm: async () => ({ status: "pending" }),
      },
      arkiv: {
        find: async () => null,
        publish: async () => ({ entityId: `0x${"77".repeat(32)}` }),
      },
    },
    { ...base },
  );
  assert.equal(outcome.operation.status, "published");
  assert.equal(deployments, 0);
});
