import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeEventTopics } from "viem";
import {
  campaignCreatedEvent,
  campaignTermsMatch,
  findCreatedCampaignFromTx,
  findCreatedCampaign,
} from "./arc-reconcile.ts";

const ACTOR = `0x${"11".repeat(20)}`;
const CAMPAIGN = `0x${"22".repeat(20)}`;
const FACTORY = `0x${"33".repeat(20)}`;
const OTHER_CAMPAIGN = `0x${"55".repeat(20)}`;
const HASH = `0x${"44".repeat(32)}`;
const OTHER_HASH = `0x${"45".repeat(32)}`;

const intendedTerms = {
  creator: ACTOR,
  reviewer: `0x${"aa".repeat(20)}`,
  usdc: `0x${"bb".repeat(20)}`,
  fundingGoal: "1000000",
  watchPrice: "1000000",
  funderBps: 5000,
  repaymentCapBps: 15000,
  fundingDeadline: "900000000",
  productionDeadline: "1000000000",
  rightsDuration: "86400",
  pitchReference:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  worldGated: false,
  perHumanLimit: "0",
};

function createdLog(creator, campaign, txHash) {
  const topics = encodeEventTopics({
    abi: [campaignCreatedEvent],
    eventName: "CampaignCreated",
    args: { creator, campaign },
  });
  return {
    address: FACTORY,
    topics,
    data: "0x",
    transactionHash: txHash,
  };
}

function actualTerms(overrides = {}) {
  return {
    creator: ACTOR,
    reviewer: `0x${"aa".repeat(20)}`,
    usdc: `0x${"bb".repeat(20)}`,
    fundingGoal: 1000000n,
    watchPrice: 1000000n,
    funderBps: 5000,
    repaymentCapBps: 15000,
    fundingDeadline: 900000000n,
    productionDeadline: 1000000000n,
    rightsDuration: 86400n,
    pitchReference:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    worldGated: false,
    perHumanLimit: 0n,
    ...overrides,
  };
}

test("factory fallback only adopts CampaignCreated logs from the persisted transaction", () => {
  const logs = [
    createdLog(ACTOR, CAMPAIGN, HASH),
    createdLog(ACTOR, OTHER_CAMPAIGN, OTHER_HASH),
    createdLog(ACTOR, OTHER_CAMPAIGN, null),
  ];
  assert.equal(findCreatedCampaignFromTx(logs, FACTORY, ACTOR, HASH), CAMPAIGN);
  assert.equal(
    findCreatedCampaignFromTx(logs, FACTORY, ACTOR, OTHER_HASH),
    OTHER_CAMPAIGN,
  );
  // A creator-only legacy scan over mixed logs adopts whichever event comes first — which is why
  // the uncertain fallback is bound to the recorded transaction instead.
  assert.equal(findCreatedCampaign(logs, FACTORY, ACTOR), CAMPAIGN);
});

test("campaign terms must match the registered intended terms exactly", () => {
  assert.equal(campaignTermsMatch(actualTerms(), intendedTerms), true);
  assert.equal(
    campaignTermsMatch(actualTerms({ fundingGoal: 1000001n }), intendedTerms),
    false,
  );
  assert.equal(
    campaignTermsMatch(
      actualTerms({ creator: `0x${"99".repeat(20)}` }),
      intendedTerms,
    ),
    false,
  );
  assert.equal(
    campaignTermsMatch(
      actualTerms({ reviewer: `0x${"cc".repeat(20)}` }),
      intendedTerms,
    ),
    false,
  );
  assert.equal(
    campaignTermsMatch(
      actualTerms({ pitchReference: `0x${"12".repeat(32)}` }),
      intendedTerms,
    ),
    false,
  );
  assert.equal(
    campaignTermsMatch(actualTerms(), { ...intendedTerms, fundingGoal: "invalid" }),
    false,
  );
  assert.equal(
    campaignTermsMatch(actualTerms({ funderBps: 4000 }), intendedTerms),
    false,
  );
  assert.equal(
    campaignTermsMatch(actualTerms({ repaymentCapBps: 15001 }), intendedTerms),
    false,
  );
  assert.equal(
    campaignTermsMatch(actualTerms({ worldGated: true }), intendedTerms),
    false,
  );
  assert.equal(
    campaignTermsMatch(actualTerms({ perHumanLimit: 1n }), intendedTerms),
    false,
  );
  assert.equal(
    campaignTermsMatch(
      actualTerms({
        fundingDeadline: 900000001n,
        productionDeadline: 1000000001n,
        rightsDuration: 86401n,
      }),
      intendedTerms,
    ),
    false,
  );
  assert.equal(campaignTermsMatch(null, intendedTerms), false);
  assert.equal(campaignTermsMatch(actualTerms(), null), false);
  assert.equal(campaignTermsMatch(actualTerms(), {}), false);
});
