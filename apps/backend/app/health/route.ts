import { NextResponse } from "next/server";

/**
 * Reports public network configuration and whether optional server integrations have credentials.
 * This endpoint is used by local tooling and deployment monitors; it never returns secret values
 * or treats a configured provider as proof that its remote service is reachable.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "reelance-backend",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
    networks: {
      arcSettlement: 5042002,
      arkivDiscovery: 7794095,
    },
    configured: {
      database: Boolean(process.env.DATABASE_URL?.trim()),
      arkivAccessKey: Boolean(process.env.ARKIV_ACCESS_KEY?.trim()),
      swarmBee: Boolean(
        process.env.SWARM_BEE_URL?.trim() && process.env.SWARM_POSTAGE_BATCH_ID?.trim(),
      ),
      swarmGateway: Boolean(process.env.SWARM_GATEWAY_URL?.trim()),
      livepeer: Boolean(process.env.LIVEPEER_API_KEY?.trim()),
      world: Boolean(
        process.env.WORLD_RP_ID?.trim() && process.env.WORLD_RP_SIGNING_KEY?.trim(),
      ),
    },
  });
}
