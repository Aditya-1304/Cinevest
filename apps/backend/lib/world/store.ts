import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { createDatabase } from "@/lib/db";
import { proofChallenges } from "@/lib/db/schema";
import { WorldError } from "./error";

export const worldHash = (value: string) => createHash("sha256").update(value).digest("hex");
export type WorldContext = {
  wallet: string; arcChainId: string; campaignAddress: string; environment: "staging" | "production";
  rpId: string; action: string; nonce: string; signal: string;
};

/** The signed token hash pins all context fields without storing the bearer token itself. */
export function createWorldStore(db = createDatabase()) {
  return {
    async issue(context: WorldContext, token: string, expiresAt: number) {
      await db.insert(proofChallenges).values({
        nonceHash: worldHash(context.nonce), contextHash: worldHash(token),
        wallet: context.wallet, arcChainId: context.arcChainId, campaignAddress: context.campaignAddress,
        environment: context.environment, expiresAt: new Date(expiresAt * 1000),
      });
    },
    async requireUnused(context: WorldContext, token: string) {
      const rows = await db.select({ nonceHash: proofChallenges.nonceHash }).from(proofChallenges).where(and(
        eq(proofChallenges.nonceHash, worldHash(context.nonce)), eq(proofChallenges.contextHash, worldHash(token)),
        eq(proofChallenges.wallet, context.wallet), isNull(proofChallenges.consumedAt), gt(proofChallenges.expiresAt, new Date()),
      )).limit(1);
      if (!rows.length) throw new WorldError("Challenge expired or already consumed", 409);
    },
    /** The database function rechecks expiry and unused status under the row lock, after provider verification. */
    async consume(context: WorldContext, token: string, scopedNullifierHash: string, proofHash: string, credentialExpiresAt: number) {
      try {
        const result = await db.execute(sql`SELECT consume_world_proof(
          ${worldHash(context.nonce)}, ${worldHash(token)}, ${context.wallet}, ${context.arcChainId},
          ${context.campaignAddress}, ${context.environment}, ${scopedNullifierHash}, ${proofHash},
          ${new Date(credentialExpiresAt * 1000).toISOString()}::timestamptz
        ) AS id`);
        return String(result.rows[0].id);
      } catch (error) {
        // Drizzle wraps driver errors; expose only known conflict categories, never database details.
        const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
        const message = cause instanceof Error ? cause.message : "";
        if (/world_(challenge_unavailable|identity_conflict|credential_expired)/.test(message)
            || (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505")) {
          throw new WorldError("Challenge used, expired, or human already bound to another wallet", 409);
        }
        throw error;
      }
    },
  };
}
