-- A renewal is a wallet operation, independent of the campaign's one-time publication.
CREATE TABLE "listing_extensions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor" text NOT NULL,
  "entity_id" text NOT NULL,
  "campaign_address" text NOT NULL,
  "target_block" text NOT NULL,
  "tx_hash" text,
  "status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending','submitted','confirmed','failed')),
  "revision" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "listing_extension_identity" ON "listing_extensions" ("actor","entity_id","target_block");
--> statement-breakpoint
