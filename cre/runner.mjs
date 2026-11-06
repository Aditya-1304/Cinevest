import { stripVTControlCharacters } from "node:util";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { reviewRequestSchema, reviewReportSchema, REPORT_MARKER } from "./protocol.ts";

const root = fileURLToPath(new URL("./", import.meta.url));
const envFile = join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const secret = process.env.CRE_RUNNER_SECRET;
if (!secret || secret.length < 32) throw new Error("Configure CRE_RUNNER_SECRET with at least 32 characters");
if (!process.env.MUX_CRE_TOKEN_ID || !process.env.MUX_CRE_TOKEN_SECRET)
  throw new Error("Configure a Mux Video read-only token for CRE");
const port = Number(process.env.CRE_RUNNER_PORT ?? 2020);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid runner port");
const host = process.env.CRE_RUNNER_HOST ?? "127.0.0.1";
let busy = false, activeChild;
const authorized = value => {
  if (typeof value !== "string") return false;
  const expected = Buffer.from("Bearer " + secret), actual = Buffer.from(value);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
function stopChild(child = activeChild) {
  if (!child?.pid) return;
  try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch { /* Already exited. */ }
}

/** Each request runs the actual CRE CLI; raw simulator logs and its private input never leave this host. */
async function simulate(request) {
  const directory = await mkdtemp(join(tmpdir(), "cinevest-cre-"));
  try {
    const payload = join(directory, "input.json");
    await writeFile(payload, JSON.stringify(request), { mode: 0o600 });
    const logs = await new Promise((resolve, reject) => {
      const env = { ...process.env,
        MUX_READ_AUTHORIZATION: "Basic " + Buffer.from(process.env.MUX_CRE_TOKEN_ID + ":" + process.env.MUX_CRE_TOKEN_SECRET).toString("base64") };
      delete env.CRE_RUNNER_SECRET;
      const child = spawn(process.env.CRE_BIN ?? "cre", [
        "workflow", "simulate", "release-readiness", "--target", "local-simulation",
        "--non-interactive", "--trigger-index", "0", "--http-payload", "@" + payload,
      ], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
      activeChild = child;
      let output = "", length = 0, failure;
      const timer = setTimeout(() => { failure = new Error("Simulation timed out"); stopChild(child); }, 120000);
      const capture = chunk => {
        length += chunk.length;
        if (length > 1024 * 1024) { failure = new Error("Simulation output exceeded limit"); stopChild(child); }
        else output += chunk.toString("utf8");
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      child.once("error", () => { clearTimeout(timer); if (activeChild === child) activeChild = undefined; reject(new Error("CRE CLI could not start")); });
      child.once("close", code => {
        clearTimeout(timer); if (activeChild === child) activeChild = undefined;
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error("CRE simulation failed"));
        else resolve(output);
      });
    });
    const lines = logs.split(/\r?\n/).map(stripVTControlCharacters);
    const reports = lines.filter(line => line.includes(REPORT_MARKER));
    if (reports.length !== 1) throw new Error("Expected one CRE report");
    const line = reports[0];
    const report = reviewReportSchema.parse(JSON.parse(line.slice(line.indexOf(REPORT_MARKER) + REPORT_MARKER.length)));
    const binding = { ...request };
    delete binding.assetId;
    for (const key of Object.keys(binding)) if (report[key] !== binding[key]) throw new Error("Report binding mismatch");
    if (report.ready !== Object.values(report.checks).every(Boolean) || report.expiresAt <= Date.now() / 1000)
      throw new Error("Invalid or expired report");
    return report;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

const server = createServer(async (req, res) => {
  const send = (status, body) => {
    if (res.destroyed) return;
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST" || req.url !== "/verify") return send(404, { error: "Not found" });
  if (!authorized(req.headers.authorization)) return send(401, { error: "Unauthorized" });
  if (busy) return send(429, { error: "CRE runner busy; retry later" });
  busy = true;
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString("utf8");
      if (Buffer.byteLength(body) > 16384) return send(413, { error: "Request too large" });
    }
    const parsed = reviewRequestSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return send(400, { error: "Invalid review request" });
    const now = Math.floor(Date.now() / 1000);
    if (parsed.data.issuedAt > now + 5 || parsed.data.issuedAt < now - 30
      || parsed.data.expiresAt <= now || parsed.data.expiresAt > parsed.data.issuedAt + 180)
      return send(400, { error: "Expired or invalid request interval" });
    send(200, await simulate(parsed.data));
  } catch {
    // No CLI stderr, payloads, media identifiers or authentication details cross this boundary.
    send(503, { error: "CRE simulation unavailable; verify CLI login and runner configuration" });
  } finally { busy = false; }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(port, host, () => console.log("Cinevest CRE simulation runner listening on port " + port));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { stopChild(); server.close(); });
