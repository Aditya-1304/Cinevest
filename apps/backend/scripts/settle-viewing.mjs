import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { config } from "dotenv";

// The CLI uses Node's TypeScript stripping with the same app aliases as Next.js.
const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({ resolve(specifier, context, nextResolve) {
  const base = specifier.startsWith("@/") ? pathToFileURL(resolve(root, specifier.slice(2))).href
    : specifier.startsWith(".") && context.parentURL ? new URL(specifier, context.parentURL).href : null;
  if (base) for (const suffix of [".ts", "/index.ts"]) {
    if (existsSync(fileURLToPath(base + suffix))) return nextResolve(base + suffix, context);
  }
  return nextResolve(specifier, context);
} });
config({ path: resolve(root, ".env.local"), quiet: true });
const watch = process.argv.includes("--watch");
const limit = Number(process.argv.slice(2).find(arg => arg !== "--watch") ?? 50);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Limit must be 1–500");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const { settleViewing } = await import("../lib/viewing/service.ts");
/** Well inside the 6-hour exit delay; --watch suits the long-running host that also runs the CRE runner. */
const INTERVAL_MS = 5 * 60_000;
do {
  try {
    const result = await settleViewing(limit);
    console.log(JSON.stringify(result));
    if (result.failed && !watch) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (!watch) process.exitCode = 1;
  }
  if (watch) await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
} while (watch);
process.exit();
