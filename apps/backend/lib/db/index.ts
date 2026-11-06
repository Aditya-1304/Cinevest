import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { requireServerEnv } from "@/lib/env";
import * as schema from "./schema";

/** Creates a request-scoped Neon HTTP client for application metadata only. */
export function createDatabase() {
  const sql = neon(requireServerEnv("DATABASE_URL"));
  return drizzle(sql, { schema });
}
