import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
/** Match Next's backend alias and resolve extensionless TypeScript imports in offline tools. */
registerHooks({ resolve(specifier, context, nextResolve) {
  const base = specifier.startsWith("@/") ? pathToFileURL(resolve(root, specifier.slice(2))).href
    : specifier.startsWith(".") && context.parentURL ? new URL(specifier, context.parentURL).href : null;
  if (base) for (const suffix of [".ts", "/index.ts"]) {
    if (existsSync(fileURLToPath(base + suffix))) return nextResolve(base + suffix, context);
  }
  return nextResolve(specifier, context);
} });
