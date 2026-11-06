-- Revision guards prevent concurrent in-place publishing updates from replacing provider IDs.
ALTER TABLE "workflow_operations" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_arc_tx_unique" ON "workflow_operations" ("arc_chain_id", "arc_tx_hash");
--> statement-breakpoint
ALTER TABLE "workflow_operations" ADD CONSTRAINT "workflow_status_valid"
  CHECK ("status" IN ('pending','uploaded','submitted','uncertain','confirmed','publishing','published','failed'));
--> statement-breakpoint
ALTER TABLE "workflow_operations" ADD CONSTRAINT "workflow_testnet_only"
  CHECK ("arc_chain_id" = '5042002');
--> statement-breakpoint
ALTER TABLE "workflow_operations" ADD CONSTRAINT "workflow_retry_nonnegative"
  CHECK ("retry_count" >= 0 AND "revision" >= 0);
--> statement-breakpoint
