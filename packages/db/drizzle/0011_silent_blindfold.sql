CREATE TABLE "fulfillments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"invoice_id" uuid,
	"payment_id" uuid,
	"title" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_client_id_client_records_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fulfillments_workspace_idx" ON "fulfillments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "fulfillments_client_idx" ON "fulfillments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "fulfillments_invoice_idx" ON "fulfillments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "fulfillments_payment_idx" ON "fulfillments" USING btree ("payment_id");--> statement-breakpoint
INSERT INTO "workspace_modules" ("workspace_id", "module_id", "enabled", "settings")
SELECT "id", 'fulfillment', true, '{"defaultKind":"other","completionLabel":"Delivered"}'::jsonb
FROM "quickengine_workspaces"
ON CONFLICT ("workspace_id", "module_id") DO NOTHING;--> statement-breakpoint
UPDATE "quickengine_workspaces"
SET "modules" = "modules" || '["fulfillment"]'::jsonb,
	"updated_at" = now()
WHERE NOT ("modules" @> '["fulfillment"]'::jsonb);
