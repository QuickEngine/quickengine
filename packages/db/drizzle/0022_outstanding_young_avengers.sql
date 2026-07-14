ALTER TABLE "invoice_line_items" ADD COLUMN "source_module" text;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "source_record_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_line_items_source_idx" ON "invoice_line_items" USING btree ("source_module","source_record_id");