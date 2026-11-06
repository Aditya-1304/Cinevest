import "server-only";
import { requireServerEnv } from "@/lib/env";

/**
 * CSRF and allowed-host guard for cookie-authenticated, state-changing requests. The only allowed
 * origin is the public APP_URL (the web app proxies /api to this service, preserving Origin); a
 * missing or foreign Origin, or a cross-site fetch-metadata header, fails closed.
 */
export function isAllowedOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(requireServerEnv("APP_URL")).origin) return false;
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin";
}
