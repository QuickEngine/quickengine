ALTER TABLE "workspace_branding" ADD COLUMN "favicon_url" text;--> statement-breakpoint
ALTER TABLE "workspace_branding" ADD COLUMN "hide_attribution" boolean DEFAULT false NOT NULL;