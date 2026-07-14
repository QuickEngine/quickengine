CREATE TABLE "reporting_traffic_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"site_key" text NOT NULL,
	"visitor_hash" text NOT NULL,
	"session_hash" text NOT NULL,
	"path" text NOT NULL,
	"referrer_host" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "succeeded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reporting_traffic_events" ADD CONSTRAINT "reporting_traffic_events_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reporting_traffic_workspace_event_idx" ON "reporting_traffic_events" USING btree ("workspace_id","event_id");--> statement-breakpoint
CREATE INDEX "reporting_traffic_workspace_time_idx" ON "reporting_traffic_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "reporting_traffic_workspace_site_time_idx" ON "reporting_traffic_events" USING btree ("workspace_id","site_key","occurred_at");