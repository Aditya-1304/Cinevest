import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { SignJWT } from "jose";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { createWorldStore } from "./store.ts";
import { verifyWorldProof } from "./verify.ts";

const wallet = `0x${"11".repeat(20)}`;
const secondWallet = `0x${"22".repeat(20)}`;
process.env.SESSION_SECRET = "world-local-check-secret-32-characters";
process.env.WORLD_RP_ID = "rp_local";
process.env.WORLD_ENVIRONMENT = "staging";
const key = new TextEncoder().encode(process.env.SESSION_SECRET);

async function fixture(store, nonce, owner = wallet, environment = "staging") {
  const context = { wallet: owner, arcChainId: "5042002", campaignAddress: `0x${"33".repeat(20)}`,
    environment, rpId: "rp_local", action: "cinevest:5042002:campaign", nonce,
    signal: `cinevest:world:v1:5042002:campaign:${owner}:${nonce}` };
  const token = await new SignJWT(context).setProtectedHeader({ alg: "HS256" })
    .setIssuer("cinevest").setAudience("cinevest-world-challenge").setIssuedAt().setExpirationTime("5m").sign(key);
  await store.issue(context, token, Math.floor(Date.now() / 1000) + 300);
  const proof = { protocol_version: "4.0", nonce, action: context.action, environment,
    action_description: "must be forwarded intact", responses: [{ identifier: "proof_of_human", issuer_schema_id: 1,
      signal_hash: hashSignal(context.signal), nullifier: "123", proof: ["1", "2", "3", "4", "5"],
      expires_at_min: Math.floor(Date.now() / 1000) + 600 }] };
  return { token, proof, context };
}
const accepted = () => Response.json({ success: true, environment: "staging",
  results: [{ success: true, identifier: "proof_of_human", nullifier: "0x7b" }] });
async function database(run) {
  const pg = new PGlite();
  try {
    const db = drizzle(pg);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
    await run(createWorldStore(db), pg);
  } finally { await pg.close(); }
}

test("official verifier forwards complete proof, records identity and rejects challenge replay", () => database(async (store, pg) => {
  const { token, proof } = await fixture(store, "first");
  const fetch = async (url, options) => {
    assert.equal(url, "https://developer.world.org/api/v4/verify/rp_local");
    assert.deepEqual(JSON.parse(options.body), proof);
    return accepted();
  };
  const result = await verifyWorldProof(wallet, token, proof, { store, fetch });
  assert.equal(result.verified, true);
  assert.equal(result.environment, "staging");
  await assert.rejects(verifyWorldProof(wallet, token, proof, { store, fetch }), { status: 409 });
  const row = (await pg.query("SELECT wallet, environment FROM world_verifications")).rows[0];
  assert.deepEqual(row, { wallet, environment: "staging" });
}));

test("concurrent verification requests cannot both consume the same challenge", () => database(async (store, pg) => {
  const { token, proof } = await fixture(store, "race");
  const attempts = await Promise.allSettled([1, 2].map(() => verifyWorldProof(wallet, token, proof, { store, fetch: async () => accepted() })));
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.find((attempt) => attempt.status === "rejected").reason.status, 409);
  assert.equal((await pg.query("SELECT * FROM world_verifications")).rows.length, 1);
  assert.equal((await pg.query("SELECT * FROM proof_challenges WHERE consumed_at IS NOT NULL")).rows.length, 1);
}));

test("identity ownership conflict rolls challenge consumption back; fresh same-wallet proof is permitted", () => database(async (store, pg) => {
  for (const nonce of ["owner-first", "owner-fresh"]) {
    const { token, proof } = await fixture(store, nonce);
    await verifyWorldProof(wallet, token, proof, { store, fetch: async () => accepted() });
  }
  const { token, proof } = await fixture(store, "second-wallet", secondWallet);
  await assert.rejects(verifyWorldProof(secondWallet, token, proof, { store, fetch: async () => accepted() }), { status: 409 });
  assert.equal((await pg.query("SELECT wallet FROM world_verifications")).rows[0].wallet, wallet);
  const unused = (await pg.query("SELECT consumed_at, proof_hash FROM proof_challenges WHERE wallet = $1", [secondWallet])).rows[0];
  assert.deepEqual(unused, { consumed_at: null, proof_hash: null });
}));

test("wallet swaps, tampered signals, legacy and session proofs fail before contacting World", () => database(async (store) => {
  const { token, proof } = await fixture(store, "context");
  const fetch = async () => { assert.fail("invalid context reached verifier"); };
  await assert.rejects(verifyWorldProof(secondWallet, token, proof, { store, fetch }), { status: 400 });
  for (const changed of [
    { ...proof, protocol_version: "3.0" }, { ...proof, session_id: "session_bad" },
    { ...proof, action: "another-campaign" }, { ...proof, nonce: "replacement" },
    { ...proof, responses: [{ ...proof.responses[0], signal_hash: "0x0" }] },
  ]) await assert.rejects(verifyWorldProof(wallet, token, changed, { store, fetch }), { status: 400 });
}));

test("invalid, mismatched and unavailable provider results never consume a challenge", () => database(async (store, pg) => {
  const { token, proof } = await fixture(store, "provider");
  const failures = [
    [() => Response.json({ success: false }), 400],
    [() => Response.json({ success: true, results: [{ success: false }] }), 400],
    [() => Response.json({ success: true, results: [{ success: true, nullifier: "456" }] }), 400],
    [() => Response.json({ success: true, results: [{ success: true, nullifier: "malformed" }] }), 400],
    [() => new Response("{}", { status: 429 }), 503],
    [() => new Response("{}", { status: 500 }), 503],
    [() => { throw new Error("timeout"); }, 503],
  ];
  for (const [fetch, status] of failures) {
    await assert.rejects(verifyWorldProof(wallet, token, proof, { store, fetch }), { status });
  }
  assert.equal((await pg.query("SELECT * FROM world_verifications")).rows.length, 0);
  assert.equal((await pg.query("SELECT consumed_at FROM proof_challenges")).rows[0].consumed_at, null);
}));

test("expired persisted challenge is rejected even when the JWT has time remaining", () => database(async (store, pg) => {
  const { token, proof } = await fixture(store, "expired");
  await pg.exec("UPDATE proof_challenges SET expires_at = now() - interval '1 second'");
  await assert.rejects(verifyWorldProof(wallet, token, proof, { store, fetch: async () => { assert.fail("expired challenge reached provider"); } }), { status: 409 });
}));
