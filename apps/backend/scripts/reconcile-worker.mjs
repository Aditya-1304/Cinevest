import "./register-paths.mjs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { assessExtensions } from "../../../scripts/extension-evidence.mjs";

// Start only after fresh measurements show recovery demand exceeding manual capacity and SLA.
const [evidenceFile, intervalInput = "60", limitInput = "20"] = process.argv.slice(2);
const intervalSeconds = Number(intervalInput), limit = Number(limitInput);
if (!evidenceFile || !Number.isInteger(intervalSeconds) || intervalSeconds < 10 || intervalSeconds > 3600
  || !Number.isInteger(limit) || limit < 1 || limit > 100)
  throw new Error("Usage: reconcile-worker.mjs MEASUREMENTS.json [INTERVAL_SECONDS=60] [LIMIT=20]");
const authorizedByMeasurements = async () => assessExtensions(JSON.parse(await readFile(evidenceFile, "utf8"))).workerRequired;
if (!await authorizedByMeasurements()) throw new Error("Fresh workload evidence does not justify a background worker");
config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const { reconcilePublications } = await import("../lib/workflows/reconcile-pass.ts");
let stopping = false, wake;
function stop() { stopping = true; wake?.(); }
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
// Sequential passes never overlap locally; CAS revisions preserve idempotence across processes and restarts.
while (!stopping) {
  try {
    if (!await authorizedByMeasurements()) break;
    const result = await reconcilePublications(limit);
    console.log(JSON.stringify({ ...result, completedAt: new Date().toISOString() }));
  } catch {
    console.error("Recovery pass failed; retrying after the configured interval.");
  }
  if (!stopping) await new Promise(resolve => {
    const timer = setTimeout(() => { wake = undefined; resolve(); }, intervalSeconds * 1000);
    wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
  });
}
