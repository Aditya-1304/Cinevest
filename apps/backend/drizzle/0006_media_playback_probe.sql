ALTER TABLE "media_uploads" ADD COLUMN "policy_type" text;
--> statement-breakpoint
ALTER TABLE "media_uploads" ADD COLUMN "probe_result" jsonb;
--> statement-breakpoint
ALTER TABLE "media_uploads" ADD COLUMN "probed_at" timestamp with time zone;
