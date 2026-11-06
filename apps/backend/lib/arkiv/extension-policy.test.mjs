import assert from "node:assert/strict";
import { test } from "node:test";
import { extensionPolicy } from "./extension-policy.ts";

test("renewal requires current ownership and reconciles the absolute expiry after a lost response", () => {
  const state = { actor: "creator", owner: "creator", creator: "creator", currentBlock: 100n, expiresAt: 200n, targetBlock: 300n };
  assert.equal(extensionPolicy(state), "ready");
  assert.equal(extensionPolicy({ ...state, owner: "other" }), "forbidden");
  assert.equal(extensionPolicy({ ...state, creator: "other" }), "forbidden");
  assert.equal(extensionPolicy({ ...state, expiresAt: 300n }), "confirmed");
  assert.equal(extensionPolicy({ ...state, expiresAt: 100n }), "expired");
  assert.equal(extensionPolicy({ ...state, targetBlock: 100n + 30n * 43_200n + 1n }), "invalid-target");
});
