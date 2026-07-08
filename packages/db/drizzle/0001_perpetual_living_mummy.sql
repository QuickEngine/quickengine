CREATE TABLE "quickengine_passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"aaguid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quickengine_passkeys" ADD CONSTRAINT "quickengine_passkeys_user_id_quickengine_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."quickengine_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quickengine_passkeys_user_idx" ON "quickengine_passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quickengine_passkeys_credential_idx" ON "quickengine_passkeys" USING btree ("credential_id");