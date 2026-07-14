CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"project_name" text NOT NULL,
	"task_id" uuid,
	"task_title" text,
	"client_id_snapshot" uuid,
	"client_name" text,
	"tracker_key" text DEFAULT 'default' NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"work_date" date,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"time_zone" text,
	"description" text,
	"billable" boolean DEFAULT true NOT NULL,
	"hourly_rate_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"billable_seconds" integer,
	"amount_cents" integer,
	"billing_rounding_mode" text,
	"billing_increment_minutes" integer,
	"invoice_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"invoiced_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entries_workspace_idx" ON "time_entries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "time_entries_workspace_status_idx" ON "time_entries" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "time_entries_workspace_date_idx" ON "time_entries" USING btree ("workspace_id","work_date");--> statement-breakpoint
CREATE INDEX "time_entries_project_idx" ON "time_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "time_entries_task_idx" ON "time_entries" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "time_entries_invoice_idx" ON "time_entries" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "time_entries_tracker_time_idx" ON "time_entries" USING btree ("workspace_id","tracker_key","started_at","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_running_tracker_idx" ON "time_entries" USING btree ("workspace_id","tracker_key") WHERE "time_entries"."status" = 'running';