ALTER TABLE "api_audit_events" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "api_audit_events_org_time_idx" ON "api_audit_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
ALTER TABLE "api_audit_events" ADD CONSTRAINT "api_audit_events_scope_check" CHECK (workspace_id is not null or organization_id is not null);