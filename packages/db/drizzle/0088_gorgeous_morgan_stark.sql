ALTER TABLE "reviews" ALTER COLUMN "catalog_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "client_record_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "source" text DEFAULT 'storefront' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "source_url" text;