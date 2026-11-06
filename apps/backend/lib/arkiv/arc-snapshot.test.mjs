import assert from "node:assert/strict";
import { test } from "node:test";
import { readCampaignSnapshots } from "./arc-snapshot.ts";

test("campaign reads share one pinned block and respect bounded concurrency", async () => {
  const campaigns = Array.from({ length: 5 }, (_, index) => `0x${String(index + 1).padStart(40, "0")}`);
  const blocks = [];
  const rpcReads = [];
  let active = 0;
  let maximumActive = 0;
  const result = await readCampaignSnapshots(
    campaigns,
    async () => 123n,
    async (campaign, blockNumber) => {
      blocks.push(blockNumber);
      const fields = ["isCampaign", "getTerms", "getStage", "raised"];
      rpcReads.push(...fields.map((field) => ({ campaign, field, blockNumber })));
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { campaign, blockNumber };
    },
    2,
  );
  assert.equal(result.blockNumber, 123n);
  assert.deepEqual(blocks, Array(5).fill(123n));
  assert.equal(maximumActive, 2);
  assert.equal(result.snapshots.length, 5);
  assert.equal(rpcReads.length, 20);
  assert.ok(rpcReads.every((read) => read.blockNumber === 123n));
});

test("duplicate listings share Arc reads without dropping their independent metadata validation", async () => {
  const campaign = `0x${"ab".repeat(20)}`;
  let reads = 0;
  const result = await readCampaignSnapshots([campaign, campaign, campaign.toUpperCase()], async () => 123n, async () => { reads++; return "verified"; }, 2);
  assert.equal(reads, 1);
  assert.deepEqual(result.snapshots, ["verified", "verified", "verified"]);
});
