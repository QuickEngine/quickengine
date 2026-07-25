ALTER TABLE "api_outbox_events" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "api_outbox_events" ADD COLUMN "actor_type" text;