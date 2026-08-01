CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"user_id" text,
	"organization_id" uuid,
	"workspace_id" uuid,
	"surface" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "product_events_name_time_idx" ON "product_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "product_events_user_time_idx" ON "product_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "product_events_workspace_idx" ON "product_events" USING btree ("workspace_id","occurred_at");