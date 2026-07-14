CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"client_name" text NOT NULL,
	"client_email" text,
	"catalog_item_id" uuid,
	"catalog_item_variant_id" uuid,
	"title" text NOT NULL,
	"schedule_key" text DEFAULT 'default' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"location_kind" text DEFAULT 'in_person' NOT NULL,
	"location" text,
	"notes" text,
	"cancellation_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"no_show_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_client_records_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_catalog_item_variant_id_catalog_item_variants_id_fk" FOREIGN KEY ("catalog_item_variant_id") REFERENCES "public"."catalog_item_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_workspace_idx" ON "bookings" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "bookings_workspace_status_idx" ON "bookings" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "bookings_schedule_time_idx" ON "bookings" USING btree ("workspace_id","schedule_key","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "bookings_client_idx" ON "bookings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bookings_catalog_item_idx" ON "bookings" USING btree ("catalog_item_id");