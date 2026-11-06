import assert from "node:assert/strict";
import { test } from "node:test";
import { encodePitch } from "./pitch.ts";

test("pitch encoding is stable and rejects invalid manifests", () => {
  const pitch = {
    title: "Example Film",
    synopsis: "A short film",
    posterRef: "ab".repeat(32),
    genre: "short-film",
    creator: `0x${"12".repeat(20)}`,
    rightsNotice: "Copyright remains with the creator",
  };
  const first = encodePitch(pitch);
  const second = encodePitch({
    ...pitch,
    posterRef: pitch.posterRef.toUpperCase(),
  });
  assert.deepEqual(first, second);
  assert.equal(JSON.parse(first.bytes.toString()).schema, "Cinevest.pitch.v1");
  assert.match(first.sha256, /^[0-9a-f]{64}$/);
  assert.throws(() => encodePitch({ ...pitch, posterRef: "invalid" }));
  assert.throws(() => encodePitch({ ...pitch, extra: "secret" }));
});
