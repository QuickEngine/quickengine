CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sku" text,
	"pricing_model" text DEFAULT 'fixed' NOT NULL,
	"price_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"unit_label" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_items_workspace_idx" ON "catalog_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "catalog_items_workspace_status_idx" ON "catalog_items" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_items_workspace_sku_unique" ON "catalog_items" USING btree ("workspace_id","sku") WHERE "catalog_items"."sku" is not null;