ALTER TABLE "notifications" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;