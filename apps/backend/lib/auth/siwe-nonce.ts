import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDatabase } from "@/lib/db";
import { siweNonces } from "@/lib/db/schema";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function hashNonce(nonce: string) {
  return createHash("sha256").update(nonce).digest("hex");
}

export async function issueNonce() {
  const bytes = randomBytes(32);
  const nonce = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await createDatabase().insert(siweNonces).values({ nonceHash: hashNonce(nonce), expiresAt });
  return { nonce, expiresAt: expiresAt.toISOString() };
}

/** Atomically consumes a nonce so concurrent verification requests cannot both succeed. */
export async function consumeNonce(nonce: string) {
  const nonceHash = hashNonce(nonce);
  const result = await createDatabase().execute(sql`
    UPDATE siwe_nonces SET used_at = now()
    WHERE nonce_hash = ${nonceHash} AND used_at IS NULL AND expires_at > now()
    RETURNING nonce_hash
  `);
  return result.rows.length === 1;
}
