CREATE TABLE "api_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"request_id" text NOT NULL,
	"source" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" uuid,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"request_id" text NOT NULL,
	"source" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_mutations_completed_result_check" CHECK ("api_mutations"."state" <> 'completed' or ("api_mutations"."response_status" is not null and "api_mutations"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "api_outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_name" text NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"request_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "api_outbox_events_version_check" CHECK ("api_outbox_events"."version" > 0),
	CONSTRAINT "api_outbox_events_attempts_check" CHECK ("api_outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "client_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"label" text,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"region" text,
	"postal_code" text,
	"country_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_addresses_country_code_check" CHECK (char_length("client_addresses"."country_code") = 2)
);
--> statement-breakpoint
ALTER TABLE "api_audit_events" ADD CONSTRAINT "api_audit_events_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_audit_events" ADD CONSTRAINT "api_audit_events_organization_id_quickengine_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."quickengine_organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_mutations" ADD CONSTRAINT "api_mutations_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_mutations" ADD CONSTRAINT "api_mutations_organization_id_quickengine_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."quickengine_organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_outbox_events" ADD CONSTRAINT "api_outbox_events_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_addresses" ADD CONSTRAINT "client_addresses_client_id_client_records_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_audit_events_workspace_time_idx" ON "api_audit_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "api_audit_events_resource_idx" ON "api_audit_events" USING btree ("workspace_id","resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_mutations_workspace_operation_key_idx" ON "api_mutations" USING btree ("workspace_id","operation","idempotency_key");--> statement-breakpoint
CREATE INDEX "api_mutations_started_idx" ON "api_mutations" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "api_outbox_events_pending_idx" ON "api_outbox_events" USING btree ("available_at") WHERE "api_outbox_events"."published_at" is null;--> statement-breakpoint
CREATE INDEX "client_addresses_workspace_client_idx" ON "client_addresses" USING btree ("workspace_id","client_id");