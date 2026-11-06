import "server-only";

import { z } from "zod";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(32).optional(),
);

/**
 * Validates server configuration at the boundary where an integration is used. Optional fields
 * keep the local web shell bootable before provider accounts exist; required values are demanded
 * by the route or adapter that depends on them.
 */
export const serverEnvSchema = z.object({
  APP_URL: optionalUrl,
  SESSION_SECRET: optionalSecret,
  DATABASE_URL: optionalText,
  DATABASE_URL_UNPOOLED: optionalText,
  ARC_RPC_URL: optionalUrl,
  ARKIV_RPC_URL: optionalUrl,
  ARKIV_ACCESS_KEY: optionalText,
  SWARM_BEE_URL: optionalUrl,
  SWARM_GATEWAY_URL: optionalUrl,
  SWARM_POSTAGE_BATCH_ID: optionalText,
  SWARM_BEE_API_KEY: optionalText,
  MUX_TOKEN_ID: optionalText,
  MUX_TOKEN_SECRET: optionalText,
  MUX_SIGNING_KEY_ID: optionalText,
  MUX_SIGNING_PRIVATE_KEY: optionalText,
  WORLD_RP_ID: optionalText,
  WORLD_RP_SIGNING_KEY: optionalText,
  WORLD_APP_ID: optionalText,
  WORLD_ACTION: optionalText,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid server environment configuration: ${issues}`);
  }
  return result.data;
}

export function requireServerEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = getServerEnv()[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value as NonNullable<ServerEnv[K]>;
}
