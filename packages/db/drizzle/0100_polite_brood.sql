ALTER TABLE "workspace_assets" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "workspace_assets_removed_idx" ON "workspace_assets" USING btree ("removed_at");