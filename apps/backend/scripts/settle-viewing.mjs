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
const limit = Number(process.argv[2] ?? 50);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Limit must be 1–500");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const { settleViewing } = await import("../lib/viewing/service.ts");
const result = await settleViewing(limit);
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
