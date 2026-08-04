CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"client_record_id" uuid NOT NULL,
	"order_id" uuid,
	"verified_purchase" boolean DEFAULT false NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"body" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"moderated_by_user_id" text,
	"moderated_at" timestamp with time zone,
	"moderation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_workspace_item_client_key" UNIQUE("workspace_id","catalog_item_id","client_record_id")
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_client_record_id_client_records_id_fk" FOREIGN KEY ("client_record_id") REFERENCES "public"."client_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_item_status_idx" ON "reviews" USING btree ("catalog_item_id","status");--> statement-breakpoint
CREATE INDEX "reviews_workspace_status_idx" ON "reviews" USING btree ("workspace_id","status");