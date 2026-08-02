CREATE TABLE "customer_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_identities_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "customer_identity_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_identity_provider_subject_key" UNIQUE("provider","subject")
);
--> statement-breakpoint
CREATE TABLE "customer_login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_login_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_customer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "workspace_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"client_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "workspace_customers_workspace_identity_key" UNIQUE("workspace_id","identity_id")
);
--> statement-breakpoint
ALTER TABLE "customer_identity_providers" ADD CONSTRAINT "customer_identity_providers_identity_id_customer_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."customer_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_login_tokens" ADD CONSTRAINT "customer_login_tokens_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_workspace_customer_id_workspace_customers_id_fk" FOREIGN KEY ("workspace_customer_id") REFERENCES "public"."workspace_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_customers" ADD CONSTRAINT "workspace_customers_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_customers" ADD CONSTRAINT "workspace_customers_identity_id_customer_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."customer_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_customers" ADD CONSTRAINT "workspace_customers_client_record_id_client_records_id_fk" FOREIGN KEY ("client_record_id") REFERENCES "public"."client_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_identity_providers_identity_idx" ON "customer_identity_providers" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "customer_login_tokens_workspace_email_idx" ON "customer_login_tokens" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "customer_login_tokens_expires_idx" ON "customer_login_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customer_sessions_customer_idx" ON "customer_sessions" USING btree ("workspace_customer_id");--> statement-breakpoint
CREATE INDEX "customer_sessions_expires_idx" ON "customer_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "workspace_customers_workspace_idx" ON "workspace_customers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_customers_identity_idx" ON "workspace_customers" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "workspace_customers_client_record_idx" ON "workspace_customers" USING btree ("client_record_id");