CREATE TABLE "content_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"kind" text DEFAULT 'single' NOT NULL,
	"value" jsonb,
	"published" boolean DEFAULT false NOT NULL,
	"label" text,
	"description" text,
	"group" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_entries_workspace_key_key" UNIQUE("workspace_id","key")
);
--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_entries_workspace_idx" ON "content_entries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "content_entries_published_idx" ON "content_entries" USING btree ("workspace_id","published");