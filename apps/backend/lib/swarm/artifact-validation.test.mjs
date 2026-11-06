import assert from "node:assert/strict";
import { test } from "node:test";
import { ChunkSplitter } from "@ethersphere/core-sdk";
import {
  ArtifactInvalidError,
  ArtifactUnavailableError,
  buildGatewayUrl,
  decodeManifestJson,
  isManifestContentType,
  normalizeImageContentType,
  parsePitchManifest,
  readBounded,
  referenceMatches,
} from "./artifact-validation.ts";

test("Swarm URLs accept only 32-byte references and stay on the configured origin", () => {
  const reference = `0x${"ab".repeat(32)}`;
  const url = buildGatewayUrl("https://swarm.example/gateway", reference);
  assert.equal(url.origin, "https://swarm.example");
  assert.equal(url.pathname, `/bytes/${reference.slice(2)}`);
  assert.throws(() => buildGatewayUrl("https://swarm.example", "https://attacker.example/file"), ArtifactInvalidError);
  assert.throws(() => buildGatewayUrl("https://user:secret@swarm.example", reference), ArtifactUnavailableError);
  assert.throws(() => buildGatewayUrl("https://swarm.example/?target=attacker", reference), ArtifactUnavailableError);
});

test("streaming artifact reads enforce the configured byte limit", async () => {
  assert.deepEqual(await readBounded(new Response(new Uint8Array([1, 2, 3])), 3), new Uint8Array([1, 2, 3]));
  await assert.rejects(readBounded(new Response(new Uint8Array([1, 2, 3, 4])), 3), ArtifactInvalidError);
  await assert.rejects(
    readBounded(new Response("data", { headers: { "content-length": "100" } }), 3),
    ArtifactInvalidError,
  );
});

test("committed bytes and manifest versions are verified before use", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({
    schema: "Cinevest.pitch.v1",
    manifestVersion: 1,
    title: "A film",
    genre: "drama",
    synopsis: "A short pitch.",
    posterRef: "ab".repeat(32),
    creator: `0x${"11".repeat(20)}`,
    rightsNotice: "Copyright remains with creator",
  }));
  const root = await ChunkSplitter.root(bytes);
  const reference = `0x${root.hash().toHex().toLowerCase()}`;
  assert.equal(await referenceMatches(bytes, reference), true);
  assert.equal(await referenceMatches(new Uint8Array([...bytes, 0]), reference), false);
  assert.equal(parsePitchManifest(decodeManifestJson(bytes)).manifestVersion, 1);
  assert.throws(
    () => parsePitchManifest({
      schema: "Cinevest.pitch.v1",
      manifestVersion: 2,
      title: "A film",
      genre: "drama",
      synopsis: "A short pitch.",
    posterRef: "ab".repeat(32),
    creator: `0x${"11".repeat(20)}`,
    rightsNotice: "Copyright remains with creator",
    }),
    ArtifactInvalidError,
  );
  assert.equal(isManifestContentType("application/json; charset=utf-8"), true);
  assert.equal(isManifestContentType("text/html"), false);
  assert.equal(normalizeImageContentType("image/png; charset=binary"), "image/png");
  assert.equal(normalizeImageContentType("image/svg+xml"), null);
  assert.throws(() => decodeManifestJson(new Uint8Array([0xff])), ArtifactInvalidError);
});
