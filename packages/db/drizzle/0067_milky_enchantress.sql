ALTER TABLE "payment_accounts" RENAME COLUMN "stripe_account_id" TO "external_account_id";--> statement-breakpoint
DROP INDEX "payment_accounts_workspace_idx";--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "payment_accounts" SET "is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_workspace_provider_idx" ON "payment_accounts" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_workspace_default_idx" ON "payment_accounts" USING btree ("workspace_id") WHERE "payment_accounts"."is_default" = true;
