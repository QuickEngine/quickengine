CREATE TABLE "quickengine_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"business_type" text NOT NULL,
	"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quickengine_users" ADD COLUMN "company_name" text;--> statement-breakpoint
ALTER TABLE "quickengine_workspaces" ADD CONSTRAINT "quickengine_workspaces_owner_id_quickengine_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."quickengine_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quickengine_workspaces_owner_idx" ON "quickengine_workspaces" USING btree ("owner_id");