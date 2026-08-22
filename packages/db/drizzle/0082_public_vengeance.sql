CREATE TABLE "workspace_email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"subject" text,
	"html" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_email_templates_key_unique" UNIQUE("workspace_id","template_key")
);
--> statement-breakpoint
ALTER TABLE "workspace_email_templates" ADD CONSTRAINT "workspace_email_templates_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;