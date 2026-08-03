CREATE TABLE "catalog_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text DEFAULT 'category' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"image_url" text,
	"featured" boolean DEFAULT false NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_categories_workspace_slug_key" UNIQUE("workspace_id","slug")
);
--> statement-breakpoint
CREATE TABLE "catalog_item_categories" (
	"catalog_item_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_item_categories_catalog_item_id_category_id_pk" PRIMARY KEY("catalog_item_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_parent_id_catalog_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."catalog_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_categories" ADD CONSTRAINT "catalog_item_categories_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_categories" ADD CONSTRAINT "catalog_item_categories_category_id_catalog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."catalog_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_categories_workspace_idx" ON "catalog_categories" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "catalog_categories_parent_idx" ON "catalog_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "catalog_item_categories_category_idx" ON "catalog_item_categories" USING btree ("category_id");