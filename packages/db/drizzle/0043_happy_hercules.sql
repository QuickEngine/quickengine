CREATE TABLE "quickengine_organization_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quickengine_organization_roles" ADD CONSTRAINT "quickengine_organization_roles_organization_id_quickengine_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."quickengine_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_roles_org_idx" ON "quickengine_organization_roles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_roles_name_unique" ON "quickengine_organization_roles" USING btree ("organization_id",lower("name"));