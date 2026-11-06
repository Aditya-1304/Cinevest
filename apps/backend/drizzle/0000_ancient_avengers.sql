CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_address" text NOT NULL,
	"asset_id" text NOT NULL,
	"playback_id" text,
	"status" text NOT NULL,
	"owner_wallet" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_challenges" (
	"nonce_hash" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"campaign_address" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "siwe_nonces" (
	"nonce_hash" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"arc_chain_id" text NOT NULL,
	"campaign_address" text,
	"request_digest" text NOT NULL,
	"swarm_reference" text,
	"arc_tx_hash" text,
	"arkiv_tx_hash" text,
	"arkiv_entity_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_address" text NOT NULL,
	"scoped_nullifier_hash" text NOT NULL,
	"wallet" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_campaign_unique" ON "media_assets" USING btree ("campaign_address");--> statement-breakpoint
CREATE INDEX "media_assets_asset_id_idx" ON "media_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "proof_challenges_wallet_campaign_idx" ON "proof_challenges" USING btree ("wallet","campaign_address");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_actor_request_unique" ON "workflow_operations" USING btree ("actor","request_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_campaign_unique" ON "workflow_operations" USING btree ("arc_chain_id","campaign_address");--> statement-breakpoint
CREATE UNIQUE INDEX "world_verifications_campaign_nullifier_unique" ON "world_verifications" USING btree ("campaign_address","scoped_nullifier_hash");--> statement-breakpoint
CREATE INDEX "world_verifications_campaign_wallet_idx" ON "world_verifications" USING btree ("campaign_address","wallet");