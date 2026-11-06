import { NextResponse } from "next/server";
import { checkBee } from "@/lib/swarm/bee";

/** Provider readiness is checked separately from the application's credential-only health route. */
export async function GET() {
  try {
    const result = await checkBee();
    return NextResponse.json(result, { status: result.healthy && result.batchUsable ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch { return NextResponse.json({ status: "artifact-unavailable", retryable: true }, { status: 503 }); }
}
