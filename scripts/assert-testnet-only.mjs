import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/** Validate checked-in deployment/ABI boundaries without calling a live network or reading secrets. */
const deployment = JSON.parse(await readFile("contracts/deployments/arc-testnet.json", "utf8"));
assert.equal(deployment.chainId, 5042002);
assert.match(deployment.address, /^0x[0-9a-fA-F]{40}$/);
assert.equal(deployment.deployer.toLowerCase(), "0xb4c01a6be9278db57803bfb57c7a9a70117afbff");
const types = await readFile("contracts/src/CampaignTypes.sol", "utf8");
assert.match(types, /ARC_TESTNET_CHAIN_ID = 5_042_002/);
assert.match(types, /0x3600000000000000000000000000000000000000/);
for (const [name, variable] of [["Campaign", "campaign"], ["CampaignFactory", "campaignFactory"], ["IERC20", "erc20"]]) {
  const artifact = JSON.parse(await readFile(`contracts/out/${name}.sol/${name}.json`, "utf8"));
  const json = JSON.parse(await readFile(`packages/abi/abi/${name}.json`, "utf8"));
  assert.deepEqual(json, artifact.abi, `${name} JSON ABI differs from the compiler`);
  const source = await readFile(`packages/abi/src/${variable}.ts`, "utf8");
  const array = source.slice(source.indexOf(" = ") + 3, source.lastIndexOf(" as const;"));
  assert.deepEqual(JSON.parse(array), artifact.abi, `${name} TypeScript ABI differs from the compiler`);
}
console.log("Testnet configuration and compiler-generated ABI checks passed");
