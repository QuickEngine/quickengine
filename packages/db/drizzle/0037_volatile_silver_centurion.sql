CREATE TABLE "quickdash_first_action_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"checklist_version" integer NOT NULL,
	"collapsed" boolean DEFAULT false NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quickdash_first_action_states" ADD CONSTRAINT "quickdash_first_action_states_user_id_quickengine_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."quickengine_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickdash_first_action_states" ADD CONSTRAINT "quickdash_first_action_states_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quickdash_first_action_states_user_workspace_idx" ON "quickdash_first_action_states" USING btree ("user_id","workspace_id");