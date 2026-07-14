CREATE TABLE "order_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"sku" text,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"position" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"client_name" text NOT NULL,
	"client_email" text,
	"fulfillment_id" uuid,
	"sequence" integer NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"placed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"processing_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_client_records_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_id_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."fulfillments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_line_items_order_idx" ON "order_line_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_workspace_idx" ON "orders" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "orders_workspace_status_idx" ON "orders" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "orders_client_idx" ON "orders" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_workspace_sequence_unique" ON "orders" USING btree ("workspace_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_workspace_number_unique" ON "orders" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_fulfillment_unique" ON "orders" USING btree ("fulfillment_id");