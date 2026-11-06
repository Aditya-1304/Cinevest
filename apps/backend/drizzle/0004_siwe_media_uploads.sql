ALTER TABLE "siwe_nonces" ALTER COLUMN "wallet" DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE "media_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "arc_chain_id" text DEFAULT '5042002' NOT NULL,
  "campaign_address" text NOT NULL,
  "attempt_key" text NOT NULL,
  "provider_asset_id" text,
  "playback_id" text,
  "status" text NOT NULL CHECK ("status" IN ('pending','uploading','processing','ready','failed')),
  "owner_wallet" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_media_release" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "arc_chain_id" text NOT NULL,
  "campaign_address" text NOT NULL,
  "media_upload_id" uuid NOT NULL REFERENCES "media_uploads"("id"),
  "playback_id_hash" text,
  "locked_at" timestamp with time zone,
  "selected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "media_uploads" ("id", "arc_chain_id", "campaign_address", "attempt_key", "provider_asset_id", "playback_id", "status", "owner_wallet", "created_at", "updated_at")
SELECT "id", '5042002', "campaign_address", "id"::text, "asset_id", "playback_id", CASE WHEN "status" IN ('pending','uploading','processing','ready','failed') THEN "status" ELSE 'failed' END, "owner_wallet", "created_at", "updated_at" FROM "media_assets";
--> statement-breakpoint
INSERT INTO "campaign_media_release" ("arc_chain_id", "campaign_address", "media_upload_id", "selected_at")
SELECT '5042002', "campaign_address", "id", "updated_at" FROM "media_assets" WHERE "playback_id" IS NOT NULL;
--> statement-breakpoint
DROP TABLE "media_assets";
--> statement-breakpoint
CREATE UNIQUE INDEX "media_uploads_attempt_unique" ON "media_uploads" ("attempt_key");
--> statement-breakpoint
CREATE INDEX "media_uploads_campaign_idx" ON "media_uploads" ("arc_chain_id", "campaign_address");
--> statement-breakpoint
CREATE INDEX "media_uploads_provider_asset_idx" ON "media_uploads" ("provider_asset_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_media_release_identity" ON "campaign_media_release" ("arc_chain_id", "campaign_address");
