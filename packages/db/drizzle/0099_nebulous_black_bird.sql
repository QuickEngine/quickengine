CREATE TABLE "workspace_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_assets" ADD CONSTRAINT "workspace_assets_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_assets_workspace_idx" ON "workspace_assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_assets_key_idx" ON "workspace_assets" USING btree ("key");