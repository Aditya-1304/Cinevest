import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth/session";
import { readJson } from "@/lib/http";
import { WorldError } from "@/lib/world/error";
import { verifyWorldProof } from "@/lib/world/verify";

/** Verifies and atomically records identity ownership; authorization issuance remains a separate P9.8 operation. */
export async function POST(request: Request) {
  const session = await authenticate(request);
  if (session instanceof NextResponse) return session;
  let input;
  try { input = z.object({ token: z.string().max(8192), proof: z.unknown() }).strict().parse(await readJson(request, 32768)); }
  catch { return NextResponse.json({ error: "Invalid proof request" }, { status: 400 }); }
  try {
    return NextResponse.json(await verifyWorldProof(session.address, input.token, input.proof), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const known = error instanceof WorldError;
    return NextResponse.json({ error: known ? error.message : "World verification temporarily unavailable" },
      { status: known ? error.status : 503, headers: { "cache-control": "no-store" } });
  }
}
