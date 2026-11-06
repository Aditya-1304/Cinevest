import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth/session";

/** Minimal protected endpoint: reports the signed-in wallet and rejects guests. */
export async function GET(request: Request) {
  const session = await authenticate(request);
  return session instanceof NextResponse ? session : NextResponse.json(session, { headers: { "cache-control": "no-store" } });
}
