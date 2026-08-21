CREATE TABLE "supplier_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_account_ref" text,
	"credentials" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_connections_supplier_provider_unique" UNIQUE("workspace_id","supplier_id","provider"),
	CONSTRAINT "supplier_connections_account_unique" UNIQUE("workspace_id","external_account_ref")
);
--> statement-breakpoint
ALTER TABLE "supplier_connections" ADD CONSTRAINT "supplier_connections_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_connections" ADD CONSTRAINT "supplier_connections_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_connections_workspace_idx" ON "supplier_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_reference_idx" ON "purchase_orders" USING btree ("workspace_id","supplier_reference");