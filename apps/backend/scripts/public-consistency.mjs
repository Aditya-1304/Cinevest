import "./register-paths.mjs";
import { writeFile } from "node:fs/promises";
import { inspectPublicFilm } from "../lib/public/consistency.ts";

// Public-only inputs; no environment loader, database, session or media API credentials.
const [entityId, gateway, output = "public-consistency.json", factory] = process.argv.slice(2);
if (!entityId || !gateway) throw new Error("Usage: public-consistency.mjs ENTITY_ID HTTPS_SWARM_GATEWAY [OUTPUT.json] [FACTORY]");
try {
  const { report } = await inspectPublicFilm(entityId, { gateway, factory });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(report.consistent ? "Public commitments match; media readiness remains unverified." : "Public consistency check failed.");
  if (!report.consistent) process.exitCode = 1;
} catch {
  // Provider exceptions may contain request URLs; never copy them into exported/public output.
  console.error("Public verification unavailable or invalid. No provider exception details were exported.");
  process.exitCode = 1;
}
