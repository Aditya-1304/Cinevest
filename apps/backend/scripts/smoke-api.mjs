import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = "http://127.0.0.1:3001";
const checks = [];
/** Exercise the built HTTP handlers without a wallet transaction or any provider signing secret. */
async function check(path, expected, body) {
  const response = await fetch(base + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  assert.equal(response.status, expected, path);
  await response.json();
  checks.push({ path, status: response.status });
}
await check("/api/health", 200);
await check("/api/market?owner=invalid", 400);
await check("/api/market?genre=" + "x".repeat(129), 400);
await check("/api/film/1/0x0000000000000000000000000000000000000001", 400);
await check("/api/publications", 400, {});
await check("/api/artifacts", 401, { action: "artifact-upload", actor: "0x0000000000000000000000000000000000000001", kind: "poster", payload: {}, issuedAt: Math.floor(Date.now() / 1000), signature: "0x1234" });
await check("/api/listings/extend", 400, {});
await check("/api/workflows/invalid", 400);
await check("/api/swarm/invalid?kind=poster", 400);
await check("/api/arkiv-rpc", 400, { jsonrpc: "2.0", id: 1, method: "personal_unlockAccount", params: [] });
const directory = fileURLToPath(new URL("../../../docs", import.meta.url));
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/backend-api-smoke.json`, JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2) + "\n");
console.log(`${checks.length} built API smoke checks passed`);
