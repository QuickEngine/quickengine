CREATE TABLE "customer_wishlist_items" (
	"workspace_customer_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"catalog_item_variant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_wishlist_items_workspace_customer_id_catalog_item_id_pk" PRIMARY KEY("workspace_customer_id","catalog_item_id")
);
--> statement-breakpoint
ALTER TABLE "customer_wishlist_items" ADD CONSTRAINT "customer_wishlist_items_workspace_customer_id_workspace_customers_id_fk" FOREIGN KEY ("workspace_customer_id") REFERENCES "public"."workspace_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_wishlist_items" ADD CONSTRAINT "customer_wishlist_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_wishlist_items" ADD CONSTRAINT "customer_wishlist_items_catalog_item_variant_id_catalog_item_variants_id_fk" FOREIGN KEY ("catalog_item_variant_id") REFERENCES "public"."catalog_item_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_wishlist_customer_idx" ON "customer_wishlist_items" USING btree ("workspace_customer_id");--> statement-breakpoint
CREATE INDEX "customer_wishlist_item_idx" ON "customer_wishlist_items" USING btree ("catalog_item_id");