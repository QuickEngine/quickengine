CREATE TABLE "workspace_activity" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"record_id" text NOT NULL,
	"actor_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workspace_activity_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "workspace_activity" ADD CONSTRAINT "workspace_activity_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_activity_workspace_idx" ON "workspace_activity" USING btree ("workspace_id","seq");