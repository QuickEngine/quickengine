CREATE TABLE "invoice_sequences" (
	"workspace_id" uuid NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_sequences_workspace_pk" PRIMARY KEY("workspace_id"),
	CONSTRAINT "invoice_sequences_positive_check" CHECK ("invoice_sequences"."last_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_sequences" (
	"workspace_id" uuid NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_sequences_workspace_pk" PRIMARY KEY("workspace_id"),
	CONSTRAINT "order_sequences_positive_check" CHECK ("order_sequences"."last_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quote_estimate_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_estimate_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"catalog_item_variant_id" uuid,
	"variant_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"item_type" text NOT NULL,
	"sku" text,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_label" text,
	"unit_price_cents" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"position" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "quote_estimate_line_items_amounts_check" CHECK ("quote_estimate_line_items"."quantity" > 0 and "quote_estimate_line_items"."unit_price_cents" >= 0 and "quote_estimate_line_items"."line_total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quote_estimate_sequences" (
	"workspace_id" uuid NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_estimate_sequences_workspace_pk" PRIMARY KEY("workspace_id"),
	CONSTRAINT "quote_estimate_sequences_positive_check" CHECK ("quote_estimate_sequences"."last_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quote_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"supersedes_id" uuid,
	"client_id" uuid,
	"client_name" text NOT NULL,
	"client_email" text,
	"client_company" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"number_prefix" text NOT NULL,
	"sequence" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"valid_until" date,
	"notes" text,
	"terms" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accepted_by_name" text,
	"accepted_by_email" text,
	"acceptance_note" text,
	"converted_invoice_id" uuid,
	"converted_order_id" uuid,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_estimates_revision_positive_check" CHECK ("quote_estimates"."sequence" > 0 and "quote_estimates"."revision" > 0),
	CONSTRAINT "quote_estimates_amounts_check" CHECK ("quote_estimates"."subtotal_cents" >= 0 and "quote_estimates"."tax_cents" >= 0 and "quote_estimates"."total_cents" = "quote_estimates"."subtotal_cents" + "quote_estimates"."tax_cents"),
	CONSTRAINT "quote_estimates_conversion_target_check" CHECK ((
				("quote_estimates"."status" = 'converted' and (case when "quote_estimates"."converted_invoice_id" is null then 0 else 1 end + case when "quote_estimates"."converted_order_id" is null then 0 else 1 end) = 1)
				or
				("quote_estimates"."status" <> 'converted' and "quote_estimates"."converted_invoice_id" is null and "quote_estimates"."converted_order_id" is null)
			))
);
--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_sequences" ADD CONSTRAINT "order_sequences_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_estimate_line_items" ADD CONSTRAINT "quote_estimate_line_items_quote_estimate_id_quote_estimates_id_fk" FOREIGN KEY ("quote_estimate_id") REFERENCES "public"."quote_estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_estimate_line_items" ADD CONSTRAINT "quote_estimate_line_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_estimate_line_items" ADD CONSTRAINT "quote_estimate_line_items_catalog_item_variant_id_catalog_item_variants_id_fk" FOREIGN KEY ("catalog_item_variant_id") REFERENCES "public"."catalog_item_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_estimate_sequences" ADD CONSTRAINT "quote_estimate_sequences_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_estimates" ADD CONSTRAINT "quote_estimates_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_estimates" ADD CONSTRAINT "quote_estimates_supersedes_id_quote_estimates_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."quote_estimates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_estimates" ADD CONSTRAINT "quote_estimates_client_id_client_records_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_estimates" ADD CONSTRAINT "quote_estimates_converted_invoice_id_invoices_id_fk" FOREIGN KEY ("converted_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_estimates" ADD CONSTRAINT "quote_estimates_converted_order_id_orders_id_fk" FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "invoice_sequences" ("workspace_id", "last_sequence", "updated_at")
SELECT
	"workspace_id",
	greatest(
		count(*)::integer,
		coalesce(
			max(
				case
					when "number" ~ '-[0-9]+$' then substring("number" from '([0-9]+)$')::integer
					else 0
				end
			),
			0
		)
	),
	now()
FROM "invoices"
GROUP BY "workspace_id";--> statement-breakpoint
INSERT INTO "order_sequences" ("workspace_id", "last_sequence", "updated_at")
SELECT "workspace_id", coalesce(max("sequence"), 0), now()
FROM "orders"
GROUP BY "workspace_id";--> statement-breakpoint
CREATE INDEX "quote_estimate_line_items_quote_idx" ON "quote_estimate_line_items" USING btree ("quote_estimate_id");--> statement-breakpoint
CREATE INDEX "quote_estimate_line_items_catalog_idx" ON "quote_estimate_line_items" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "quote_estimate_line_items_variant_idx" ON "quote_estimate_line_items" USING btree ("catalog_item_variant_id");--> statement-breakpoint
CREATE INDEX "quote_estimates_workspace_idx" ON "quote_estimates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "quote_estimates_workspace_status_idx" ON "quote_estimates" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "quote_estimates_client_idx" ON "quote_estimates" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "quote_estimates_series_idx" ON "quote_estimates" USING btree ("workspace_id","series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_estimates_workspace_number_idx" ON "quote_estimates" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_estimates_series_revision_idx" ON "quote_estimates" USING btree ("workspace_id","series_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_estimates_supersedes_idx" ON "quote_estimates" USING btree ("supersedes_id") WHERE "quote_estimates"."supersedes_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_estimates_converted_invoice_idx" ON "quote_estimates" USING btree ("converted_invoice_id") WHERE "quote_estimates"."converted_invoice_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_estimates_converted_order_idx" ON "quote_estimates" USING btree ("converted_order_id") WHERE "quote_estimates"."converted_order_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_workspace_number_unique" ON "invoices" USING btree ("workspace_id","number");
