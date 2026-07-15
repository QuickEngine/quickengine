ALTER TABLE "fulfillments" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "client_email" text;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "client_company" text;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "source_module" text;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "source_record_id" uuid;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fulfillments" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
UPDATE "fulfillments" f
SET
	"client_name" = coalesce(i."client_name", c."name"),
	"client_email" = coalesce(i."client_email", c."email"),
	"client_company" = coalesce(i."client_company", c."company"),
	"invoice_number" = i."number"
FROM "invoices" i
LEFT JOIN "client_records" c ON c."id" = i."client_id" AND c."workspace_id" = i."workspace_id"
WHERE i."id" = f."invoice_id" AND i."workspace_id" = f."workspace_id";--> statement-breakpoint
UPDATE "fulfillments" f
SET
	"client_name" = c."name",
	"client_email" = c."email",
	"client_company" = c."company"
FROM "client_records" c
WHERE f."invoice_id" IS NULL AND c."id" = f."client_id" AND c."workspace_id" = f."workspace_id";--> statement-breakpoint
UPDATE "fulfillments" f
SET "source_module" = 'orders', "source_record_id" = o."id"
FROM "orders" o
WHERE o."fulfillment_id" = f."id" AND o."workspace_id" = f."workspace_id";--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillments_source_unique" ON "fulfillments" USING btree ("workspace_id","source_module","source_record_id");
