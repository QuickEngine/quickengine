CREATE TABLE "shipping_carrier_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"environment" text DEFAULT 'live' NOT NULL,
	"credentials" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_carrier_connections_unique" UNIQUE("workspace_id","carrier","environment")
);
--> statement-breakpoint
ALTER TABLE "shipping_carrier_connections" ADD CONSTRAINT "shipping_carrier_connections_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipping_carrier_connections_workspace_idx" ON "shipping_carrier_connections" USING btree ("workspace_id");