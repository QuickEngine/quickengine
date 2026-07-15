ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_catalog_item_id_catalog_items_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_catalog_item_variant_id_catalog_item_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_catalog_item_variant_id_catalog_item_variants_id_fk" FOREIGN KEY ("catalog_item_variant_id") REFERENCES "public"."catalog_item_variants"("id") ON DELETE no action ON UPDATE no action;