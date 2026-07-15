ALTER TABLE "invoices" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "client_email" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "client_company" text;--> statement-breakpoint
UPDATE "invoices" AS "invoice"
SET
	"client_name" = "client"."name",
	"client_email" = "client"."email",
	"client_company" = "client"."company"
FROM "client_records" AS "client"
WHERE "invoice"."client_id" = "client"."id";
