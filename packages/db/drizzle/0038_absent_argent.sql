CREATE TABLE "quickdash_orientation_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"orientation_version" integer NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quickdash_orientation_states" ADD CONSTRAINT "quickdash_orientation_states_user_id_quickengine_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."quickengine_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickdash_orientation_states" ADD CONSTRAINT "quickdash_orientation_states_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quickdash_orientation_states_user_workspace_idx" ON "quickdash_orientation_states" USING btree ("user_id","workspace_id");