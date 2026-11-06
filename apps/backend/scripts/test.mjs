import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
/** Run actual Node test cases in each module, including TypeScript imports and server boundaries. */
for (const directory of ["arkiv", "swarm", "workflows", "db", "media", "world"]) {
  for (const name of readdirSync(`${root}lib/${directory}`).filter(name => name.endsWith(".test.mjs"))) {
    execFileSync(process.execPath, ["--conditions=react-server", "--import", `${root}scripts/register-paths.mjs`, `${root}lib/${directory}/${name}`], { stdio: "inherit" });
  }
}
