CREATE TABLE "quickengine_organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quickengine_organization_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "quickengine_organization_invitations" ADD CONSTRAINT "quickengine_organization_invitations_organization_id_quickengine_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."quickengine_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickengine_organization_invitations" ADD CONSTRAINT "quickengine_organization_invitations_invited_by_user_id_quickengine_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."quickengine_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickengine_organization_invitations" ADD CONSTRAINT "quickengine_organization_invitations_accepted_by_user_id_quickengine_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."quickengine_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quickengine_org_invitations_org_idx" ON "quickengine_organization_invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "quickengine_org_invitations_email_idx" ON "quickengine_organization_invitations" USING btree ("email");