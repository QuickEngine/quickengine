CREATE TABLE "inventory_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"on_hand_delta" integer NOT NULL,
	"reserved_delta" integer NOT NULL,
	"resulting_on_hand" integer NOT NULL,
	"resulting_reserved" integer NOT NULL,
	"note" text,
	"reference_id" uuid,
	"idempotency_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"catalog_item_variant_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_catalog_item_variant_id_catalog_item_variants_id_fk" FOREIGN KEY ("catalog_item_variant_id") REFERENCES "public"."catalog_item_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_adjustments_workspace_idx" ON "inventory_adjustments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "inventory_adjustments_item_idx" ON "inventory_adjustments" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "inventory_adjustments_reference_idx" ON "inventory_adjustments" USING btree ("reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_adjustments_idempotency_unique" ON "inventory_adjustments" USING btree ("workspace_id","idempotency_key") WHERE "inventory_adjustments"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "inventory_items_workspace_idx" ON "inventory_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "inventory_items_catalog_item_idx" ON "inventory_items" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_base_target_unique" ON "inventory_items" USING btree ("workspace_id","catalog_item_id") WHERE "inventory_items"."catalog_item_variant_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_variant_target_unique" ON "inventory_items" USING btree ("workspace_id","catalog_item_variant_id") WHERE "inventory_items"."catalog_item_variant_id" is not null;