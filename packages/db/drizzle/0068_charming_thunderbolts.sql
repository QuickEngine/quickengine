CREATE TABLE "customer_portal_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_customer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"audience" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_portal_handoffs_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "customer_portal_handoffs" ADD CONSTRAINT "customer_portal_handoffs_workspace_customer_id_workspace_customers_id_fk" FOREIGN KEY ("workspace_customer_id") REFERENCES "public"."workspace_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_portal_handoffs_customer_idx" ON "customer_portal_handoffs" USING btree ("workspace_customer_id");--> statement-breakpoint
CREATE INDEX "customer_portal_handoffs_expires_idx" ON "customer_portal_handoffs" USING btree ("expires_at");