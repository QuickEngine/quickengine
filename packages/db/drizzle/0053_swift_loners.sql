CREATE TABLE "workspace_branding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"portal_slug" text NOT NULL,
	"custom_domain" text,
	"portal_enabled" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"support_email" text,
	"logo_url" text,
	"tagline" text,
	"accent_color" text,
	"website_url" text,
	"portal_publishable_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_branding_workspace_id_unique" UNIQUE("workspace_id"),
	CONSTRAINT "workspace_branding_portal_slug_unique" UNIQUE("portal_slug"),
	CONSTRAINT "workspace_branding_custom_domain_unique" UNIQUE("custom_domain")
);
--> statement-breakpoint
ALTER TABLE "workspace_branding" ADD CONSTRAINT "workspace_branding_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_branding_workspace_idx" ON "workspace_branding" USING btree ("workspace_id");