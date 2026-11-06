import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth/session";
import { readJson } from "@/lib/http";
import { validateWorldContext } from "@/lib/world/challenge";

/** Diagnostic boundary for P9.3; this endpoint never marks a human verified or authorizes funding. */
export async function POST(request: Request) {
  const session = await authenticate(request);
  if (session instanceof NextResponse) return session;
  try {
    const input = z.object({ token: z.string().max(8192), proof: z.unknown() }).strict().parse(await readJson(request, 32768));
    await validateWorldContext(session.address, input.token, input.proof);
    return NextResponse.json({ contextValidated: true, verified: false }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Expired challenge or mismatched proof context" }, { status: 400 });
  }
}
