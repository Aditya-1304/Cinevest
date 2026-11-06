import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignTermsInput, deserializeCampaignTerms } from "./terms-input.ts";

const terms = { creator: `0x${"11".repeat(20)}`, reviewer: `0x${"22".repeat(20)}`,
  usdc: "0x3600000000000000000000000000000000000000", fundingGoal: "100000000", fundingDeadline: "1800000000",
  productionDeadline: "1801000000", rightsDuration: "86400", watchPrice: "2000000", funderBps: 2000,
  repaymentCapBps: 15000, pitchReference: `0x${"ab".repeat(32)}`, worldGated: false, perHumanLimit: "0" };

test("wire terms preserve precision and reject malformed, unsupported, or uncommitted campaigns", () => {
  assert.equal(deserializeCampaignTerms(terms).fundingGoal, 100000000n);
  for (const override of [{ fundingGoal: "invalid" }, { fundingDeadline: "bad" }, { productionDeadline: "bad" },
    { fundingGoal: "0" }, { fundingGoal: (2n ** 256n).toString() }, { fundingDeadline: (2n ** 64n).toString() },
    { creator: terms.reviewer }, { funderBps: 10001 }, { worldGated: "false" }, { pitchReference: `0x${"00".repeat(32)}` },
    { usdc: `0x${"33".repeat(20)}` }, { unexpected: true }]) {
    assert.equal(campaignTermsInput.safeParse({ ...terms, ...override }).success, false);
  }
});
