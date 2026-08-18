CREATE TABLE "supplier_skus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"supplier_sku" text NOT NULL,
	"supplier_name" text,
	"unit_cost_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"lead_time_days" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_skus_supplier_item_unique" UNIQUE("supplier_id","catalog_item_id")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"handoff_method" text DEFAULT 'unknown' NOT NULL,
	"handoff_target" text,
	"lead_time_days" integer,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_skus" ADD CONSTRAINT "supplier_skus_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_skus" ADD CONSTRAINT "supplier_skus_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_skus" ADD CONSTRAINT "supplier_skus_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_skus_workspace_idx" ON "supplier_skus" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "supplier_skus_supplier_idx" ON "supplier_skus" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_skus_item_idx" ON "supplier_skus" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "suppliers_workspace_idx" ON "suppliers" USING btree ("workspace_id");