ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_customer_id_workspace_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_client_records_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."client_records"("id") ON DELETE cascade ON UPDATE no action;