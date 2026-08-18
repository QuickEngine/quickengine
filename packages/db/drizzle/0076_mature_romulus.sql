CREATE TABLE "subscription_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plan_items_unique" UNIQUE("plan_id","catalog_item_id")
);
--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP CONSTRAINT "subscription_plans_catalog_item_id_catalog_items_id_fk";
--> statement-breakpoint
DROP INDEX "subscription_plans_item_idx";--> statement-breakpoint
ALTER TABLE "subscription_plan_items" ADD CONSTRAINT "subscription_plan_items_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_items" ADD CONSTRAINT "subscription_plan_items_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_items" ADD CONSTRAINT "subscription_plan_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_plan_items_workspace_idx" ON "subscription_plan_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "subscription_plan_items_plan_idx" ON "subscription_plan_items" USING btree ("plan_id");--> statement-breakpoint
ALTER TABLE "subscription_plans" DROP COLUMN "catalog_item_id";