ALTER TABLE "notifications" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_source_key" UNIQUE("user_id","source_key");