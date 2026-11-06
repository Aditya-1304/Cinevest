import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth/session";
import { readJson } from "@/lib/http";
import { issueWorldAuthorization } from "@/lib/world/issuer";
import { WorldError } from "@/lib/world/error";

/** Token-only recovery never re-verifies or reconsumes the proof and cannot mint a replacement permission. */
export async function POST(request: Request) {
  const session = await authenticate(request);
  if (session instanceof NextResponse) return session;
  let input;
  try { input = z.object({ token: z.string().max(8192) }).strict().parse(await readJson(request, 10_240)); }
  catch { return NextResponse.json({ error: "Invalid authorization request" }, { status: 400 }); }
  try {
    return NextResponse.json(await issueWorldAuthorization(session.address, input.token), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof WorldError ? error.message : "Funding permission is temporarily unavailable" },
      { status: error instanceof WorldError ? error.status : 503, headers: { "cache-control": "no-store" } });
  }
}
