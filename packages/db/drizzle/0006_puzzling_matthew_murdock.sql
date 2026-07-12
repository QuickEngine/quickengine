CREATE TABLE "quickengine_organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quickengine_organizations" ADD COLUMN "is_personal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quickengine_workspaces" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "quickengine_organization_members" ADD CONSTRAINT "quickengine_organization_members_organization_id_quickengine_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."quickengine_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickengine_organization_members" ADD CONSTRAINT "quickengine_organization_members_user_id_quickengine_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."quickengine_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quickengine_org_members_org_user_idx" ON "quickengine_organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "quickengine_org_members_user_idx" ON "quickengine_organization_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "quickengine_workspaces" ADD CONSTRAINT "quickengine_workspaces_organization_id_quickengine_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."quickengine_organizations"("id") ON DELETE cascade ON UPDATE no action;