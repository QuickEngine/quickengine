DROP INDEX "payment_refunds_provider_external_unique";--> statement-breakpoint
DROP INDEX "payments_provider_external_unique";--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN "environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "quickengine_workspaces" ADD COLUMN "environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_provider_external_unique" ON "payment_refunds" USING btree ("provider","environment","external_refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_external_unique" ON "payments" USING btree ("provider","environment","external_payment_id");