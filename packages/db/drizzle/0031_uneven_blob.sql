CREATE TABLE "quickengine_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quickengine_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "quickengine_api_keys" ADD CONSTRAINT "quickengine_api_keys_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickengine_api_keys" ADD CONSTRAINT "quickengine_api_keys_created_by_user_id_quickengine_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."quickengine_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quickengine_api_keys_workspace_idx" ON "quickengine_api_keys" USING btree ("workspace_id");