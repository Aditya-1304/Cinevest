import "server-only";

import { Bee } from "@ethersphere/bee-js";
import { getServerEnv, requireServerEnv } from "../env";

function beeClient() {
  const env = getServerEnv();
  return new Bee(requireServerEnv("SWARM_BEE_URL"), {
    network: "sepolia",
    timeout: 15_000,
    ...(env.SWARM_BEE_API_KEY && {
      headers: { Authorization: `Bearer ${env.SWARM_BEE_API_KEY}` },
    }),
  });
}

export async function checkBee() {
  const batch = requireServerEnv("SWARM_POSTAGE_BATCH_ID");
  if (!/^[a-fA-F0-9]{64}$/.test(batch))
    throw new Error("Invalid Swarm postage batch ID");
  const bee = beeClient();
  const [health, stamp, globalBatch] = await Promise.all([
    bee.status.getHealth(),
    bee.stamp.get(batch),
    bee.stamp.getGlobal(batch),
  ]);
  const ttlSeconds = Math.max(0, Math.min(stamp.duration.toSeconds(), globalBatch.batchTTL));
  return {
    healthy: health.status === "ok",
    batchUsable: stamp.usable && globalBatch.batchTTL > 0 && ttlSeconds > 0,
    ttlSeconds,
    usable: stamp.usable,
    batchTtlSeconds: globalBatch.batchTTL,
  };
}

export async function uploadPublicBytes(bytes: Uint8Array) {
  const batch = requireServerEnv("SWARM_POSTAGE_BATCH_ID");
  if (!/^[a-fA-F0-9]{64}$/.test(batch))
    throw new Error("Invalid Swarm postage batch ID");
  const status = await checkBee();
  if (!status.healthy || !status.batchUsable || status.ttlSeconds <= 0) {
    throw new Error("Configured Swarm postage batch is expired or unusable");
  }
  const bee = beeClient();
  // bee-js adds erasure-coding parity by default, which changes the root of anything larger than
  // one chunk. Public artifacts commit to the plain chunk-tree root (what ChunkSplitter.root and
  // the browser compute), so upload with redundancy level 0 through Bee's HTTP API.
  const env = getServerEnv();
  const response = await fetch(new URL("/bytes", requireServerEnv("SWARM_BEE_URL")), {
    method: "POST",
    headers: {
      "swarm-postage-batch-id": batch,
      "swarm-redundancy-level": "0",
      "content-type": "application/octet-stream",
      ...(env.SWARM_BEE_API_KEY && { authorization: `Bearer ${env.SWARM_BEE_API_KEY}` }),
    },
    body: bytes as BodyInit,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Swarm upload failed with status ${response.status}`);
  const { reference } = (await response.json()) as { reference?: string };
  if (typeof reference !== "string" || !/^[0-9a-f]{64}$/i.test(reference))
    throw new Error("Swarm returned an invalid reference");
  const downloaded = await bee.data.download(reference);
  if (!downloaded.equals(bytes))
    throw new Error("Swarm read-back did not match uploaded bytes");
  return reference.toLowerCase();
}

export async function readPublicBytes(reference: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(reference))
    throw new Error("Invalid public Swarm reference");
  return (await beeClient().data.download(reference)).toUint8Array();
}
