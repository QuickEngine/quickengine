CREATE TABLE "shipment_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"order_line_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"weight_grams" integer NOT NULL,
	"length_millimeters" integer,
	"width_millimeters" integer,
	"height_millimeters" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"fulfillment_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"destination" jsonb NOT NULL,
	"carrier" text,
	"service_level" text,
	"tracking_number" text,
	"tracking_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shipped_at" timestamp with time zone,
	"in_transit_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_order_line_item_id_order_line_items_id_fk" FOREIGN KEY ("order_line_item_id") REFERENCES "public"."order_line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_parcels" ADD CONSTRAINT "shipment_parcels_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_fulfillment_id_fulfillments_id_fk" FOREIGN KEY ("fulfillment_id") REFERENCES "public"."fulfillments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_lines_shipment_idx" ON "shipment_lines" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_lines_order_line_idx" ON "shipment_lines" USING btree ("order_line_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_lines_target_unique" ON "shipment_lines" USING btree ("shipment_id","order_line_item_id");--> statement-breakpoint
CREATE INDEX "shipment_parcels_shipment_idx" ON "shipment_parcels" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipments_workspace_idx" ON "shipments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_workspace_status_idx" ON "shipments" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_fulfillment_unique" ON "shipments" USING btree ("fulfillment_id");