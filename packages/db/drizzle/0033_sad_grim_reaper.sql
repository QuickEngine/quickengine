DROP INDEX "quickengine_subscriptions_user_idx";--> statement-breakpoint
DROP INDEX "quickengine_subscriptions_org_idx";--> statement-breakpoint
ALTER TABLE "quickengine_subscriptions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quickengine_subscriptions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "quickengine_subscriptions_org_idx" ON "quickengine_subscriptions" USING btree ("organization_id");