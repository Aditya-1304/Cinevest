import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
/** Run actual Node test cases in each module, including TypeScript imports and server boundaries. */
for (const directory of ["arkiv", "swarm", "workflows", "db", "media", "world", "viewing"]) {
  for (const name of readdirSync(`${root}lib/${directory}`).filter(name => name.endsWith(".test.mjs"))) {
    execFileSync(process.execPath, ["--conditions=react-server", "--import", new URL("register-paths.mjs", import.meta.url).href, `${root}lib/${directory}/${name}`], { stdio: "inherit" });
  }
}
