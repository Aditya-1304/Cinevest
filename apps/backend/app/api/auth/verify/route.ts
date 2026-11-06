import { NextResponse } from "next/server";
import { z } from "zod";
import { requireServerEnv } from "@/lib/env";
import { readJson } from "@/lib/http";
import { isAllowedOrigin } from "@/lib/auth/origin";
import { setSessionCookie } from "@/lib/auth/session";
import { verifySiwe } from "@/lib/auth/siwe-verify";

const bodySchema = z.object({ message: z.string().min(1).max(8192), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(2048) }).strict();

/** Verifies a SIWE message and, on success, starts the HttpOnly cookie session. */
export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(request, 12 * 1024));
  } catch {
    return NextResponse.json({ error: "Invalid authentication request" }, { status: 400 });
  }
  // Fail before consuming the nonce when the session cannot be issued.
  try { requireServerEnv("SESSION_SECRET"); } catch { return NextResponse.json({ error: "Authentication is temporarily unavailable" }, { status: 503 }); }
  const result = await verifySiwe(body);
  if (!result) return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  const response = NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  try { await setSessionCookie(response, result.address); } catch { return NextResponse.json({ error: "Authentication is temporarily unavailable" }, { status: 503 }); }
  return response;
}
