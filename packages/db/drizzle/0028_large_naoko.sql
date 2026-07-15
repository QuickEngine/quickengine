CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"provider" text NOT NULL,
	"external_refund_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "client_email" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "client_company" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_method" text DEFAULT 'card' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "external_payment_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "notes" text;--> statement-breakpoint
UPDATE "payments" p
SET
	"client_name" = coalesce(i."client_name", (SELECT c."name" FROM "client_records" c WHERE c."id" = p."client_id" AND c."workspace_id" = p."workspace_id")),
	"client_email" = coalesce(i."client_email", (SELECT c."email" FROM "client_records" c WHERE c."id" = p."client_id" AND c."workspace_id" = p."workspace_id")),
	"client_company" = coalesce(i."client_company", (SELECT c."company" FROM "client_records" c WHERE c."id" = p."client_id" AND c."workspace_id" = p."workspace_id")),
	"external_payment_id" = p."stripe_payment_intent_id"
FROM "invoices" i
WHERE i."id" = p."invoice_id" AND i."workspace_id" = p."workspace_id";--> statement-breakpoint
UPDATE "payments" p
SET
	"client_name" = c."name",
	"client_email" = c."email",
	"client_company" = c."company",
	"external_payment_id" = p."stripe_payment_intent_id"
FROM "client_records" c
WHERE p."invoice_id" IS NULL AND c."id" = p."client_id" AND c."workspace_id" = p."workspace_id";--> statement-breakpoint
UPDATE "payments"
SET "external_payment_id" = "stripe_payment_intent_id"
WHERE "external_payment_id" IS NULL AND "stripe_payment_intent_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "payment_refunds" ("workspace_id", "payment_id", "amount_cents", "provider", "reason", "created_at")
SELECT "workspace_id", "id", "amount_cents", "provider", 'Backfilled from legacy refunded status', coalesce("refunded_at", "updated_at")
FROM "payments"
WHERE "status" = 'refunded';--> statement-breakpoint
CREATE INDEX "payment_refunds_workspace_idx" ON "payment_refunds" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "payment_refunds_payment_idx" ON "payment_refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_provider_external_unique" ON "payment_refunds" USING btree ("provider","external_refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_external_unique" ON "payments" USING btree ("provider","external_payment_id");
