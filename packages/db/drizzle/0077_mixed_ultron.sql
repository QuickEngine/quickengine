ALTER TABLE "referral_codes" ADD COLUMN "commission_basis_points" integer;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD COLUMN "discount_id" uuid;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action;