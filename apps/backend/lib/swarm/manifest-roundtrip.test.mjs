import assert from "node:assert/strict";
import { test } from "node:test";
import { encodePitch } from "./pitch.ts";
import { encodeMilestone } from "./milestone.ts";
import { parsePitchManifest, parseMilestoneManifest } from "./artifact-validation.ts";

test("uploaded pitch and milestone bytes round-trip through the actual artifact reader schemas", () => {
  const creator = `0x${"11".repeat(20)}`;
  const pitch = { title: "A film", synopsis: "Public pitch", posterRef: "ab".repeat(32), genre: "drama", creator, rightsNotice: "Creator retains copyright" };
  assert.equal(parsePitchManifest(JSON.parse(encodePitch(pitch).bytes.toString())).synopsis, pitch.synopsis);
  const evidence = { campaignAddress: creator, milestoneIndex: 1, evidenceFiles: ["ab".repeat(32)], submittedAt: 1800000000, text: "Rough cut" };
  assert.equal(parseMilestoneManifest(JSON.parse(encodeMilestone(evidence).toString()), creator, 1).text, evidence.text);
  assert.throws(() => encodePitch({ ...pitch, title: "映".repeat(43) }));
});
