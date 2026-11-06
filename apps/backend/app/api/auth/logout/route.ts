import { NextResponse } from "next/server";
import { isAllowedOrigin } from "@/lib/auth/origin";
import { clearSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  clearSessionCookie(response);
  return response;
}
