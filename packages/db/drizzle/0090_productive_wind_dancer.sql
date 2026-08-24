ALTER TABLE "payments" ADD COLUMN "supplier_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "checkout_amount_cents" integer;