import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Stores one-time SIWE challenges; the nonce hash is the lookup key, never a session secret. */
export const siweNonces = pgTable("siwe_nonces", {
  nonceHash: text("nonce_hash").primaryKey(),
  wallet: text("wallet").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Maps a creator-owned Livepeer asset to a canonical Arc campaign. This table supports upload
 * retries and processing status; it does not grant viewing access or replace onchain checks.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignAddress: text("campaign_address").notNull(),
    assetId: text("asset_id").notNull(),
    playbackId: text("playback_id"),
    status: text("status").notNull(),
    ownerWallet: text("owner_wallet").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("media_assets_campaign_unique").on(table.campaignAddress),
    index("media_assets_asset_id_idx").on(table.assetId),
  ],
);

/** Stores campaign-scoped World nullifier ownership after the backend verifies a proof. */
export const worldVerifications = pgTable(
  "world_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignAddress: text("campaign_address").notNull(),
    scopedNullifierHash: text("scoped_nullifier_hash").notNull(),
    wallet: text("wallet").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("world_verifications_campaign_nullifier_unique").on(
      table.campaignAddress,
      table.scopedNullifierHash,
    ),
    index("world_verifications_campaign_wallet_idx").on(table.campaignAddress, table.wallet),
  ],
);

/** Tracks short-lived proof challenges so a verified result cannot be replayed by the API. */
export const proofChallenges = pgTable(
  "proof_challenges",
  {
    nonceHash: text("nonce_hash").primaryKey(),
    wallet: text("wallet").notNull(),
    campaignAddress: text("campaign_address").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("proof_challenges_wallet_campaign_idx").on(table.wallet, table.campaignAddress)],
);

/** Durable publication checkpoints; compare-and-set updates prevent concurrent retries. */
export const workflowOperations = pgTable("workflow_operations", {
  id: uuid("id").primaryKey(),
  actor: text("actor").notNull(),
  arcChainId: text("arc_chain_id").notNull(),
  campaignAddress: text("campaign_address"),
  requestDigest: text("request_digest").notNull(),
  termsJson: text("terms_json"),
  swarmReference: text("swarm_reference"),
  arcTxHash: text("arc_tx_hash"),
  arkivTxHash: text("arkiv_tx_hash"),
  arkivEntityId: text("arkiv_entity_id"),
  status: text("status").notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  revision: integer("revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workflow_actor_request_unique").on(table.actor, table.requestDigest),
  uniqueIndex("workflow_campaign_unique").on(table.arcChainId, table.campaignAddress),
]);

/** Tracks creator-signed listing renewals separately from immutable campaign publication identity. */
export const listingExtensions = pgTable("listing_extensions", {
  id: uuid("id").defaultRandom().primaryKey(),
  actor: text("actor").notNull(),
  entityId: text("entity_id").notNull(),
  campaignAddress: text("campaign_address").notNull(),
  targetBlock: text("target_block").notNull(),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("pending"),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("listing_extension_identity").on(table.actor, table.entityId, table.targetBlock)]);
