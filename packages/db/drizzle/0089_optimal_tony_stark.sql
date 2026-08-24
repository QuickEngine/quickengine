CREATE TABLE "supplier_payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"external_account_id" text NOT NULL,
	"environment" text DEFAULT 'live' NOT NULL,
	"transfers_enabled" text DEFAULT 'unknown' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requirements" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payment_accounts_unique" UNIQUE("supplier_id","provider","environment")
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_payment_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"order_id" uuid,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"environment" text DEFAULT 'live' NOT NULL,
	"status" text DEFAULT 'calculated' NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"external_transfer_id" text,
	"idempotency_key" text NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"reversed_cents" integer DEFAULT 0 NOT NULL,
	"reversal_reason" text,
	"initiated_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_purchase_order_unique" UNIQUE("purchase_order_id"),
	CONSTRAINT "supplier_payments_transfer_unique" UNIQUE("external_transfer_id"),
	CONSTRAINT "supplier_payments_idempotency_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "supplier_payment_accounts" ADD CONSTRAINT "supplier_payment_accounts_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_accounts" ADD CONSTRAINT "supplier_payment_accounts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_events" ADD CONSTRAINT "supplier_payment_events_supplier_payment_id_supplier_payments_id_fk" FOREIGN KEY ("supplier_payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_events" ADD CONSTRAINT "supplier_payment_events_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_payment_accounts_workspace_idx" ON "supplier_payment_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "supplier_payment_events_payment_idx" ON "supplier_payment_events" USING btree ("supplier_payment_id");--> statement-breakpoint
CREATE INDEX "supplier_payment_events_workspace_idx" ON "supplier_payment_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_workspace_idx" ON "supplier_payments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_idx" ON "supplier_payments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_status_idx" ON "supplier_payments" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "supplier_payments_order_idx" ON "supplier_payments" USING btree ("order_id");