CREATE TABLE "quickengine_two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "quickengine_users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quickengine_two_factors" ADD CONSTRAINT "quickengine_two_factors_user_id_quickengine_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."quickengine_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quickengine_two_factors_user_idx" ON "quickengine_two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quickengine_two_factors_secret_idx" ON "quickengine_two_factors" USING btree ("secret");