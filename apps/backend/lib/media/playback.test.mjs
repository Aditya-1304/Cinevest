import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { generateKeyPairSync } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { SiweMessage } from "siwe";

// Replace external database, Arc and CRE boundaries; routes, authorization and queries remain real.
const stub = (body) => `data:text/javascript,${encodeURIComponent(body)}`;
const stubs = {
  "./cre": stub("export const checkCreRelease = (...args) => globalThis.__cre(...args);"),
  "@/lib/db": stub("export const createDatabase = () => globalThis.__db;"),
  "@/lib/media/arc": stub("export const readCampaignMedia = (...args) => globalThis.__arc(...args); export const canInspectRelease = async (wallet, creator, reviewer) => wallet === creator || wallet === reviewer;"),
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: stubs[specifier], shortCircuit: true };
  return next(specifier === "next/server" ? "next/server.js" : specifier, context);
} });

const keys = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
Object.assign(process.env, {
  APP_URL: "http://localhost:3000", SESSION_SECRET: "s".repeat(40), MUX_TOKEN_ID: "id", MUX_TOKEN_SECRET: "secret",
  MUX_SIGNING_KEY_ID: "kid-1", MUX_SIGNING_PRIVATE_KEY: Buffer.from(keys.privateKey).toString("base64"),
});
const root = fileURLToPath(new URL("../../", import.meta.url));
const schema = await import("@/lib/db/schema");
const { setSessionCookie } = await import("@/lib/auth/session");
const { POST: authorize } = await import("../../app/api/playback/authorize/route.ts");
const { POST: verifySiweRoute } = await import("../../app/api/auth/verify/route.ts");
const { POST: startUploadRoute } = await import("../../app/api/media/uploads/route.ts");
const { POST: selectRoute } = await import("../../app/api/media/release/route.ts");
const { GET: verifyReleaseRoute } = await import("../../app/api/media/release/verify/route.ts");
const { issueNonce } = await import("@/lib/auth/siwe-nonce");
const { reconcileUpload } = await import("./reconcile.ts");
const { startUpload } = await import("./uploads.ts");
const { verifyRelease } = await import("./verify-release.ts");
const { playbackIdHash } = await import("./release.ts");
const { jwtVerify, importSPKI } = await import("jose");

const pg = new PGlite();
const db = drizzle(pg, { schema });
await migrate(db, { migrationsFolder: `${root}drizzle` });
globalThis.__db = db;

const CHAIN = "5042002";
const campaign = `0x${"c1".repeat(20)}`;
const owner = `0x${"aa".repeat(20)}`; // creator / paying viewer
const stranger = `0x${"bb".repeat(20)}`;
const PB = "pbid1234567890ab";
const ORIGIN = "http://localhost:3000";
let n = 0;

const arcState = { released: true, paid: new Set([owner]), hash: playbackIdHash(PB).toLowerCase(), outage: false };
globalThis.__arc = async (address, wallet) => {
  if (arcState.outage) throw new Error("Arc RPC unavailable");
  if (address !== campaign) return null;
  return { creator: owner, reviewer: stranger, released: arcState.released, paid: arcState.paid.has(String(wallet).toLowerCase()), onchainHash: arcState.hash, locked: false };
};

async function cookieFor(address) {
  const response = new Response(); const holder = { cookies: { set: (name, value) => (response.value = `${name}=${value}`) } };
  await setSessionCookie(holder, address);
  return response.value;
}
const post = (handler, body, { cookie, origin = ORIGIN } = {}) => handler(new Request("http://localhost:3001/x", {
  method: "POST", body: JSON.stringify(body),
  headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) },
}));
async function seedRelease({ playbackId = PB, status = "ready" } = {}) {
  const [row] = await db.insert(schema.mediaUploads).values({ arcChainId: CHAIN, campaignAddress: campaign, attemptKey: `seed-${++n}`, providerUploadId: `up-${n}`, providerAssetId: `asset-${n}`, playbackId, durationSeconds: 7200, status, ownerWallet: owner }).returning();
  await db.delete(schema.campaignMediaRelease);
  await db.insert(schema.campaignMediaRelease).values({ arcChainId: CHAIN, campaignAddress: campaign, mediaUploadId: row.id, playbackIdHash: playbackIdHash(playbackId) });
  return row;
}
const body = { arcChainId: CHAIN, campaignAddress: campaign };

test("I18: playback credentials are issued only for a valid SIWE session wallet with confirmed paid access", async () => {
  await seedRelease();
  const cookie = await cookieFor(owner);
  const ok = await post(authorize, body, { cookie });
  assert.equal(ok.status, 200);
  const grant = await ok.json();
  const { payload } = await jwtVerify(grant.token, await importSPKI(keys.publicKey, "RS256"), { algorithms: ["RS256"], audience: "v" });
  assert.equal(payload.sub, PB); // token is scoped to exactly the selected asset
  assert.equal(payload.kid, "kid-1");
  assert.ok(payload.exp - Math.floor(Date.now() / 1000) >= 120 * 60 + 14 * 60, "token outlives the film (Mux embeds it in segment URLs)");
  assert.equal(grant.playbackId, PB);

  assert.equal((await post(authorize, body)).status, 401, "guest");
  assert.equal((await post(authorize, body, { cookie, origin: "http://evil.example" })).status, 403, "foreign origin");
  assert.equal((await post(authorize, body, { cookie, origin: null })).status, 403, "missing origin");
  assert.equal((await post(authorize, body, { cookie: cookie.slice(0, -4) + "AAAA" })).status, 401, "tampered session");
  process.env.SESSION_SECRET = "z".repeat(40); // a session minted under another secret is a forgery
  assert.equal((await post(authorize, body, { cookie })).status, 401, "forged session");
  process.env.SESSION_SECRET = "s".repeat(40);

  const other = await post(authorize, body, { cookie: await cookieFor(stranger) });
  assert.equal(other.status, 403, "another wallet that has not paid"); // borrowing someone else's purchase fails
  assert.equal((await post(authorize, { ...body, playbackId: "other", txHash: `0x${"11".repeat(32)}` }, { cookie })).status, 400, "client cannot supply a hash or tx");
  assert.equal((await post(authorize, { ...body, wallet: stranger }, { cookie })).status, 400, "client cannot choose the wallet");
});

test("wrong chain, malformed or unknown campaign, and unpublished films never get a token", async () => {
  const cookie = await cookieFor(owner);
  assert.equal((await post(authorize, { ...body, arcChainId: "1" }, { cookie })).status, 400, "wrong chain");
  assert.equal((await post(authorize, { ...body, campaignAddress: "0x1234" }, { cookie })).status, 400, "bad address");
  assert.equal((await post(authorize, { ...body, campaignAddress: `0x${"d2".repeat(20)}` }, { cookie })).status, 404, "unknown campaign");
  arcState.released = false;
  assert.equal((await post(authorize, body, { cookie })).status, 404, "unpublished film");
  arcState.released = true;
});

test("a selection that does not match Arc, or is not ready, fails closed", async () => {
  const cookie = await cookieFor(owner);
  await seedRelease({ playbackId: "someOtherPlayback1" });
  assert.equal((await post(authorize, body, { cookie })).status, 409, "db hash differs from Arc");
  await seedRelease({ status: "processing" });
  assert.equal((await post(authorize, body, { cookie })).status, 409, "asset not ready");
  await db.delete(schema.campaignMediaRelease);
  assert.equal((await post(authorize, body, { cookie })).status, 409, "no release selected");
});

test("SIWE: replayed message, foreign domain, wrong chain and expired issuance are rejected", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const sign = async (overrides = {}) => {
    const { nonce } = await issueNonce();
    const message = new SiweMessage({ domain: "localhost:3000", address: account.address, statement: "Sign in", uri: ORIGIN, version: "1", chainId: Number(CHAIN), nonce, issuedAt: new Date().toISOString(), ...overrides }).prepareMessage();
    return { message, signature: await account.signMessage({ message }) };
  };
  const good = await sign();
  const first = await post(verifySiweRoute, good);
  assert.equal(first.status, 200);
  assert.match(first.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.equal((await post(verifySiweRoute, good)).status, 401, "replayed nonce");
  assert.equal((await post(verifySiweRoute, await sign({ domain: "evil.example" }))).status, 401, "foreign domain");
  assert.equal((await post(verifySiweRoute, await sign({ chainId: 1 }))).status, 401, "wrong chain");
  assert.equal((await post(verifySiweRoute, await sign({ issuedAt: new Date(Date.now() - 3600_000).toISOString() }))).status, 401, "stale message");
  const forged = await sign(); forged.signature = await privateKeyToAccount(generatePrivateKey()).signMessage({ message: forged.message });
  assert.equal((await post(verifySiweRoute, forged)).status, 401, "signature from another wallet");
  assert.equal((await post(verifySiweRoute, good, { origin: "http://evil.example" })).status, 403, "foreign origin cannot start a session");
});

// ---- P8.11a failure matrix: deterministic injected faults, fail-closed authorization, recoverable uploads ----

const realFetch = globalThis.fetch;
function provider(handlers) {
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    for (const [match, handle] of handlers) if (url.pathname.startsWith(match)) return handle(url, init);
    throw new Error(`unexpected fetch ${url}`);
  };
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const muxAsset = (status, extra = {}) => json({ data: { id: "asset-x", status, duration: 120, playback_ids: [{ id: PB, policy: "signed" }], ...extra } });

test("Arc RPC outage fails every authorization route closed", async () => {
  const cookie = await cookieFor(owner);
  arcState.outage = true;
  try {
    assert.equal((await post(authorize, body, { cookie })).status, 503);
    assert.equal((await post(startUploadRoute, { ...body, attemptKey: crypto.randomUUID(), contentType: "video/mp4", sizeBytes: 10 }, { cookie })).status, 503);
    assert.equal((await verifyReleaseRoute(new Request(`http://localhost:3001/x?arcChainId=${CHAIN}&campaignAddress=${campaign}`, { headers: { cookie } }))).status, 503);
    assert.equal((await post(selectRoute, { ...body, uploadId: crypto.randomUUID() }, { cookie })).status, 503);
  } finally { arcState.outage = false; }
});

test("lost upload response and slow provider leave one recoverable attempt", async () => {
  const attemptKey = crypto.randomUUID();
  const input = { arcChainId: CHAIN, campaignAddress: campaign, ownerWallet: owner, attemptKey };
  provider([["/video/v1/uploads", () => { throw new Error("response lost"); }]]);
  await assert.rejects(startUpload(input));
  const [pending] = await db.select().from(schema.mediaUploads).where(eq(schema.mediaUploads.attemptKey, attemptKey));
  assert.equal(pending.status, "pending"); // attempt persisted before the provider call, no provider upload yet
  provider([["/video/v1/uploads", () => json({ data: { id: "up-77", url: "https://storage.example/upload", status: "waiting" } }, 201)]]);
  const [a, b] = await Promise.all([startUpload(input), startUpload(input)]);
  assert.equal(a.id, pending.id); assert.equal(b.id, pending.id);
  assert.equal((await db.select().from(schema.mediaUploads).where(eq(schema.mediaUploads.attemptKey, attemptKey))).length, 1);
  const again = await startUpload(input); // browser interruption: same attempt, same URL
  assert.equal(again.status, "uploading"); assert.equal(again.uploadUrl, "https://storage.example/upload"); assert.equal(again.providerUploadId, "up-77");
  await assert.rejects(startUpload({ ...input, ownerWallet: stranger }), /already in use/);

  provider([["/video/v1/uploads/", () => json({ data: { id: "up-77", status: "waiting" } })]]);
  assert.equal((await reconcileUpload(again)).row.status, "uploading"); // still waiting for the file
  provider([["/video/v1/uploads/", () => new Promise((_, reject) => setTimeout(() => reject(new DOMException("timeout", "TimeoutError")), 5))]]);
  const slow = await reconcileUpload(again);
  assert.equal(slow.stale, true); assert.equal(slow.row.status, "uploading"); // timeout never regresses or fails the attempt
  provider([["/video/v1/uploads/", () => json({ data: { id: "up-77", status: "asset_created", asset_id: "asset-77" } })], ["/video/v1/assets/", () => muxAsset("ready", { duration: 5 * 3600 })]]);
  const long = await reconcileUpload(again);
  assert.equal(long.row.status, "failed"); assert.equal(long.row.providerAssetId, "asset-77"); // overlong asset is rejected at reconciliation
});

test("duplicate provider callbacks converge on a single ready state", async () => {
  const [row] = await db.insert(schema.mediaUploads).values({ arcChainId: CHAIN, campaignAddress: campaign, attemptKey: crypto.randomUUID(), providerUploadId: "up-dup", providerAssetId: "asset-dup", status: "uploading", ownerWallet: owner }).returning();
  provider([["/video/v1/assets/", () => muxAsset("ready")]]);
  const results = await Promise.all(Array.from({ length: 6 }, () => reconcileUpload(row)));
  assert.ok(results.every((r) => r.row.status === "ready" && r.row.playbackId === PB && r.row.durationSeconds === 120));
  provider([["/video/v1/assets/", () => muxAsset("errored")]]); // a late conflicting callback cannot undo ready
  assert.equal((await reconcileUpload({ ...row, status: "uploading" })).row.status, "ready");
});

// Model the CRE provider verdict while retaining the real final-review gate and hash checks.
globalThis.__cre = async (_campaign, assetId, commitment) => {
  const response = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`);
  const asset = response.ok ? (await response.json()).data : undefined;
  const checks = {
    providerReady: asset?.status === "ready",
    signedOnly: Boolean(asset?.playback_ids?.length && asset.playback_ids.every(id => id.policy === "signed")),
    commitmentMatches: Boolean(asset?.playback_ids?.some(id => playbackIdHash(id.id).toLowerCase() === commitment)),
  };
  return { ready: Object.values(checks).every(Boolean), checks, expiresAt: Math.floor(Date.now() / 1000) + 180 };
};

test("provider asset deletion or policy reset is caught by the final-review gate", async () => {
  await seedRelease();
  const onchain = arcState.hash;
  provider([["/video/v1/assets/", () => new Response("{}", { status: 404 })]]); // asset deleted
  assert.equal((await verifyRelease(CHAIN, campaign, onchain)).ok, false);
  provider([["/video/v1/assets/", () => muxAsset("ready", { playback_ids: [{ id: PB, policy: "signed" }, { id: "publicId0123456789", policy: "public" }] })]]); // public playback ID added
  const reset = await verifyRelease(CHAIN, campaign, onchain);
  assert.equal(reset.ok, false); assert.equal(reset.checks.nonpublicPolicy, false);
  provider([["/video/v1/assets/", () => muxAsset("ready", { playback_ids: [{ id: "swappedPlayback01", policy: "signed" }] })]]); // playback ID changed under us
  assert.equal((await verifyRelease(CHAIN, campaign, onchain)).ok, false);
  provider([["/video/v1/assets/", () => muxAsset("ready")]]);
  assert.equal((await verifyRelease(CHAIN, campaign, `0x${"00".repeat(32)}`)).checks.hashMatchesArc, false); // Arc commitment differs
  provider([["/video/v1/assets/", () => { throw new Error("provider down"); }]]);
  await assert.rejects(verifyRelease(CHAIN, campaign, onchain)); // unavailable provider is an error, never a pass
});

test.after(async () => { globalThis.fetch = realFetch; await pg.close(); });
