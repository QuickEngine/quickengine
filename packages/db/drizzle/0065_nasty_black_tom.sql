CREATE TABLE "shipping_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"min_weight_grams" integer,
	"max_weight_grams" integer,
	"min_order_cents" integer,
	"max_order_cents" integer,
	"base_cents" integer DEFAULT 0 NOT NULL,
	"per_kg_cents" integer,
	"free_over_cents" integer,
	"estimated_days_min" integer,
	"estimated_days_max" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_rates_zone_name_key" UNIQUE("zone_id","name"),
	CONSTRAINT "shipping_rates_base_cents_check" CHECK ("shipping_rates"."base_cents" >= 0),
	CONSTRAINT "shipping_rates_per_kg_cents_check" CHECK ("shipping_rates"."per_kg_cents" IS NULL OR "shipping_rates"."per_kg_cents" >= 0),
	CONSTRAINT "shipping_rates_free_over_cents_check" CHECK ("shipping_rates"."free_over_cents" IS NULL OR "shipping_rates"."free_over_cents" >= 0),
	CONSTRAINT "shipping_rates_weight_band_check" CHECK ("shipping_rates"."min_weight_grams" IS NULL OR "shipping_rates"."max_weight_grams" IS NULL OR "shipping_rates"."max_weight_grams" > "shipping_rates"."min_weight_grams"),
	CONSTRAINT "shipping_rates_order_band_check" CHECK ("shipping_rates"."min_order_cents" IS NULL OR "shipping_rates"."max_order_cents" IS NULL OR "shipping_rates"."max_order_cents" > "shipping_rates"."min_order_cents")
);
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"country_codes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"region_codes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_zones_workspace_name_key" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
ALTER TABLE "catalog_item_variants" ADD COLUMN "weight_grams_override" integer;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "weight_grams" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_rate_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_line1" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_line2" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_city" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_region" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_postal_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_country_code" text;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zone_id_shipping_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD CONSTRAINT "shipping_zones_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipping_rates_workspace_zone_idx" ON "shipping_rates" USING btree ("workspace_id","zone_id");--> statement-breakpoint
CREATE INDEX "shipping_zones_workspace_active_idx" ON "shipping_zones" USING btree ("workspace_id","active");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_rate_id_shipping_rates_id_fk" FOREIGN KEY ("shipping_rate_id") REFERENCES "public"."shipping_rates"("id") ON DELETE set null ON UPDATE no action;