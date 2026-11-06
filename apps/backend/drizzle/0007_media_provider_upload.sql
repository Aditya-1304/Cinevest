ALTER TABLE "media_uploads" ADD COLUMN "provider_upload_id" text;
--> statement-breakpoint
ALTER TABLE "media_uploads" ADD COLUMN "duration_seconds" integer;
--> statement-breakpoint
CREATE INDEX "media_uploads_provider_upload_idx" ON "media_uploads" ("provider_upload_id");
