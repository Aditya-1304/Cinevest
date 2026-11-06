import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignTermsDigest } from "@reelance/abi/campaign-terms-digest";
import {
  validateFilmCandidate,
  verifyFilmCandidateTerms,
  verifyRegisteredFilmCandidate,
} from "./candidate-validation.ts";

const creator = `0x${"11".repeat(20)}`;
const reviewer = `0x${"22".repeat(20)}`;
const campaign = `0x${"33".repeat(20)}`;
const terms = {
  creator,
  reviewer,
  usdc: "0x3600000000000000000000000000000000000000",
  fundingGoal: 100n,
  fundingDeadline: 900n,
  productionDeadline: 1_000n,
  rightsDuration: 86_400n,
  watchPrice: 1n,
  funderBps: 7_000,
  repaymentCapBps: 15_000,
  pitchReference: `0x${"ab".repeat(32)}`,
  worldGated: false,
  perHumanLimit: 0n,
};

function entity(overrides = {}) {
  return {
    $key: `0x${"44".repeat(32)}`,
    $owner: creator,
    arcChainId: { value: 5_042_002n },
    campaignAddress: { value: campaign },
    creatorAddress: { value: creator },
    genre: { value: "drama" },
    fundingDeadline: { value: terms.fundingDeadline },
    title: { value: "A test film" },
    pitchSwarmRef: { value: terms.pitchReference },
    posterSwarmRef: { value: `0x${"cd".repeat(32)}` },
    termsDigest: { value: campaignTermsDigest(5_042_002, terms) },
    createdAt: { value: 800n },
    schemaVersion: { value: 1n },
    ...overrides,
  };
}

test("forged chain and Arkiv owner candidates are rejected", () => {
  assert.equal(validateFilmCandidate(entity({ arcChainId: { value: 1n } }), 5_042_002).valid, false);
  assert.equal(validateFilmCandidate(entity({ $owner: reviewer }), 5_042_002).valid, false);
  assert.equal(validateFilmCandidate(entity({ campaignAddress: { value: "0x0000000000000000000000000000000000000001" } }), 5_042_002).valid, true);
  const candidate = validateFilmCandidate(entity(), 5_042_002);
  assert.equal(candidate.valid, true);
  if (candidate.valid) {
    assert.equal(verifyRegisteredFilmCandidate(candidate.entity, false, undefined, 5_042_002, terms.usdc), "factory_unregistered");
  }
});

test("pitch, deadline, and immutable digest must match Arc terms", () => {
  const candidate = validateFilmCandidate(entity(), 5_042_002);
  assert.equal(candidate.valid, true);
  if (!candidate.valid) return;
  assert.equal(verifyFilmCandidateTerms(candidate.entity, terms, 5_042_002, terms.usdc), null);
  assert.equal(
    verifyFilmCandidateTerms(candidate.entity, { ...terms, pitchReference: `0x${"ef".repeat(32)}` }, 5_042_002, terms.usdc),
    "pitch_reference_mismatch",
  );
  assert.equal(
    verifyFilmCandidateTerms({ ...candidate.entity, fundingDeadline: { value: 901n } }, terms, 5_042_002, terms.usdc),
    "funding_deadline_mismatch",
  );
  assert.equal(
    verifyFilmCandidateTerms({ ...candidate.entity, termsDigest: { value: `0x${"00".repeat(32)}` } }, terms, 5_042_002, terms.usdc),
    "terms_digest_mismatch",
  );
});
