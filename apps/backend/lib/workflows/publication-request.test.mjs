import assert from "node:assert/strict";
import { test } from "node:test";
import {
  publicationMessage,
  stableStringify as backendStableStringify,
  publicationMessageIsRecent,
} from "./publication-request.ts";
// The web mirror signs the actor's wallet message; this contract pins it to the backend rebuild.
import {
  publicationMessage as webPublicationMessage,
  stableStringify as webStableStringify,
} from "../../../web/lib/publication.ts";

const payload = {
  action: "register",
  actor: `0x${"11".repeat(20)}`,
  arcChainId: 5042002,
  issuedAt: 1762300000,
  signature: undefined,
  arcTxHash: `0x${"44".repeat(32)}`,
  terms: {
    perHumanLimit: "0",
    funderBps: 5000,
    worldGated: false,
    fundingGoal: "1000000",
  },
};

test("canonical journal messages are byte-identical across the apps", () => {
  const backend = publicationMessage(payload);
  const web = webPublicationMessage({ ...payload });
  assert.equal(web, backend);
  assert.equal(
    backendStableStringify(payload.terms),
    webStableStringify(payload.terms),
  );
  // Key order and whitespace must not change the signed bytes.
  const reordered = {
    terms: {
      worldGated: false,
      fundingGoal: "1000000",
      funderBps: 5000,
      perHumanLimit: "0",
    },
    arcTxHash: payload.arcTxHash,
    issuedAt: payload.issuedAt,
    arcChainId: payload.arcChainId,
    actor: payload.actor,
    action: "register",
    signature: undefined,
  };
  assert.equal(publicationMessage(reordered), backend);
});

test("journal messages cannot be signed far outside their freshness window", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(
    publicationMessageIsRecent(
      Math.floor(now / 1000) - 10,
      now,
    ),
    true,
  );
  assert.equal(
    publicationMessageIsRecent(
      Math.floor(now / 1000) - 601,
      now,
    ),
    false,
  );
  assert.equal(publicationMessageIsRecent("1762000000", now), false);
  assert.equal(publicationMessageIsRecent(1.5, now), false);
});
