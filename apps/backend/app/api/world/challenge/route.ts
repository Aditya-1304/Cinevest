import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth/session";
import { readJson } from "@/lib/http";
import { challengeInput, issueWorldChallenge } from "@/lib/world/challenge";

/** Derives the wallet from SIWE, never from caller-supplied JSON. */
export async function POST(request: Request) {
  const session = await authenticate(request);
  if (session instanceof NextResponse) return session;
  let input;
  try { input = challengeInput.parse(await readJson(request, 4096)); }
  catch { return NextResponse.json({ error: "Invalid campaign context" }, { status: 400 }); }
  try {
    return NextResponse.json(await issueWorldChallenge(session.address, input), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "World challenge configuration unavailable" }, { status: 503 });
  }
}
