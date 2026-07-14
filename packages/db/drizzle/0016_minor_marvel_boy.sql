ALTER TABLE "order_line_items" ADD COLUMN "catalog_item_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD COLUMN "variant_options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_catalog_item_variant_id_catalog_item_variants_id_fk" FOREIGN KEY ("catalog_item_variant_id") REFERENCES "public"."catalog_item_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_line_items_variant_idx" ON "order_line_items" USING btree ("catalog_item_variant_id");