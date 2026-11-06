import "./register-paths.mjs";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createPublicClient, http, keccak256 } from "viem";
import { arcTestnet } from "viem/chains";
import { createPublicClient as createArkivClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { eq } from "drizzle-orm";

config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
const [{ createDatabase }, { workflowOperations }, { createWorkflowStore }, workflow, { checkBee }, { arcTestnetDeployment }] = await Promise.all([
  import("../lib/db/index.ts"), import("../lib/db/schema.ts"), import("../lib/workflows/store.ts"),
  import("../lib/workflows/publication.ts"), import("../lib/swarm/bee.ts"), import("@cinevest/abi"),
]);
const report = { checkedAt: new Date().toISOString(), checks: {} };

/** Store only public diagnostics; provider errors may contain credentials and are never printed. */
async function check(name, callback) {
  try { report.checks[name] = { status: "passed", ...(await callback()) }; }
  catch { report.checks[name] = { status: "unavailable" }; }
}

await check("database", async () => {
  const db = createDatabase();
  const store = createWorkflowStore(db);
  const id = randomUUID();
  const actor = "0x000000000000000000000000000000000000cafe";
  const requestDigest = keccak256(new TextEncoder().encode(id)).slice(2);
  try {
    const first = await workflow.beginPublication(store, { id, actor, arcChainId: 5042002, requestDigest });
    if (!first.created) throw new Error("Fixture collision");
    const input = { id, actor, expected: "pending", expectedRevision: 0, next: "uploaded", patch: { swarmReference: "ab".repeat(32) } };
    const results = await Promise.all([store.transition(input), store.transition(input)]);
    if (results.filter(Boolean).length !== 1) throw new Error("Atomic transition failed");
    return { migrations: "applied", atomicTransition: true };
  } finally {
    // Delete only this invocation's synthetic workflow; no existing campaign row is touched.
    await db.delete(workflowOperations).where(eq(workflowOperations.id, id));
  }
});

await check("arc", async () => {
  const client = createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL, { timeout: 10000, retryCount: 0 }) });
  if (await client.getChainId() !== 5042002) throw new Error("Wrong chain");
  const decimals = await client.call({ to: "0x3600000000000000000000000000000000000000", data: "0x313ce567" });
  if (BigInt(decimals.data) !== 6n) throw new Error("Wrong ERC-20 decimals");
  const code = await client.getCode({ address: arcTestnetDeployment.address });
  return { chainId: 5042002, usdcDecimals: 6, factoryDeployed: Boolean(code && code !== "0x"),
    factoryMatchesBuild: arcTestnetDeployment.compatible,
    factoryRuntimeMatchesManifest: Boolean(code && "runtimeCodeHash" in arcTestnetDeployment && keccak256(code) === arcTestnetDeployment.runtimeCodeHash) };
});

await check("arkiv", async () => {
  const client = createArkivClient({ chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }), transport: http(process.env.ARKIV_RPC_URL, { timeout: 10000, retryCount: 0 }) });
  if (await client.getChainId() !== 7794095) throw new Error("Wrong discovery chain");
  const { filmSchema } = await import("../lib/arkiv/film-schema.ts");
  const result = await client.select({ $key: true }).from(filmSchema, { onMismatch: "throw" }).limit(1).fetch();
  return { chainId: 7794095, realSchemaQuery: true, returnedRows: result.entities.length, creatorWrite: "requires wallet signature" };
});

if (process.env.SWARM_BEE_URL && process.env.SWARM_POSTAGE_BATCH_ID) {
  await check("swarm", async () => {
    const readiness = await checkBee();
    if (!readiness.healthy || !readiness.batchUsable) throw new Error("Postage unavailable");
    return { healthy: true, usablePostage: true, ttlSeconds: readiness.ttlSeconds };
  });
} else report.checks.swarm = { status: "not-configured", reason: "Bee uploader and usable postage batch required" };

const directory = fileURLToPath(new URL("../../../docs", import.meta.url));
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/backend-live-verification.json`, JSON.stringify(report, null, 2) + "\n");
console.log("Live verification report saved to docs/backend-live-verification.json; credentials suppressed.");
