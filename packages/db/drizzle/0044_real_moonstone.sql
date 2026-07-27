CREATE TABLE "quickengine_credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid,
	"kind" text NOT NULL,
	"amount_micros" bigint NOT NULL,
	"description" text,
	"agent_run_id" text,
	"stripe_payment_intent_id" text,
	"source_entry_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quickengine_credit_entries" ADD CONSTRAINT "quickengine_credit_entries_organization_id_quickengine_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."quickengine_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickengine_credit_entries" ADD CONSTRAINT "quickengine_credit_entries_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_entries_org_idx" ON "quickengine_credit_entries" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_entries_workspace_idx" ON "quickengine_credit_entries" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_entries_source_idx" ON "quickengine_credit_entries" USING btree ("source_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_entries_payment_intent_unique" ON "quickengine_credit_entries" USING btree ("stripe_payment_intent_id") WHERE "quickengine_credit_entries"."stripe_payment_intent_id" is not null;