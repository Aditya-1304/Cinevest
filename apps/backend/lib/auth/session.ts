import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { NextResponse } from "next/server";
import { requireServerEnv } from "@/lib/env";
import { isAllowedOrigin } from "./origin";

const COOKIE = "cinevest_session";
const TTL_SECONDS = 8 * 60 * 60;
const claims = { issuer: "cinevest", audience: "cinevest-api" };

export type Session = { address: string };

const key = () => new TextEncoder().encode(requireServerEnv("SESSION_SECRET"));
// Secure cookies are mandatory whenever the public origin is HTTPS; plain-HTTP is local development only.
const secure = () => new URL(requireServerEnv("APP_URL")).protocol === "https:";
const cookieOptions = () => ({ httpOnly: true, secure: secure(), sameSite: "strict" as const, path: "/api" });

/** Stateless signed session: logout clears the cookie, and the short TTL bounds a leaked token. */
export async function setSessionCookie(response: NextResponse, address: string) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(address.toLowerCase())
    .setIssuer(claims.issuer).setAudience(claims.audience).setIssuedAt().setExpirationTime(`${TTL_SECONDS}s`).sign(key());
  response.cookies.set(COOKIE, token, { ...cookieOptions(), maxAge: TTL_SECONDS });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

export async function getSession(request: Request): Promise<Session | null> {
  const token = request.headers.get("cookie")?.split(/;\s*/).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { ...claims, algorithms: ["HS256"] });
    return typeof payload.sub === "string" && /^0x[0-9a-f]{40}$/.test(payload.sub) ? { address: payload.sub } : null;
  } catch { return null; }
}

/** Session middleware for protected routes: rejects guests and, for mutations, foreign origins. */
export async function authenticate(request: Request): Promise<Session | NextResponse> {
  if (!["GET", "HEAD"].includes(request.method) && !isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }
  return (await getSession(request)) ?? NextResponse.json({ error: "Sign-in required" }, { status: 401, headers: { "cache-control": "no-store" } });
}
