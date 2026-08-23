DROP INDEX "payment_accounts_workspace_provider_idx";--> statement-breakpoint
DROP INDEX "payment_accounts_workspace_default_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_workspace_provider_env_idx" ON "payment_accounts" USING btree ("workspace_id","provider","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_workspace_default_idx" ON "payment_accounts" USING btree ("workspace_id","environment") WHERE "payment_accounts"."is_default" = true;