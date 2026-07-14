CREATE TABLE "catalog_item_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"combination_key" text NOT NULL,
	"options" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sku" text,
	"price_cents_override" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_item_variants" ADD CONSTRAINT "catalog_item_variants_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_variants" ADD CONSTRAINT "catalog_item_variants_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_item_variants_workspace_idx" ON "catalog_item_variants" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "catalog_item_variants_item_idx" ON "catalog_item_variants" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_variants_combination_unique" ON "catalog_item_variants" USING btree ("catalog_item_id","combination_key");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_variants_workspace_sku_unique" ON "catalog_item_variants" USING btree ("workspace_id","sku") WHERE "catalog_item_variants"."sku" is not null;