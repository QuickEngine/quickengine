CREATE TABLE "customer_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workspace_customer_id" uuid NOT NULL,
	"topic_key" text DEFAULT 'general' NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_conversations_customer_topic_key" UNIQUE("workspace_customer_id","topic_key")
);
--> statement-breakpoint
CREATE TABLE "customer_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"operator_user_id" text,
	"body" text NOT NULL,
	"dedupe_key" text,
	"read_by_customer_at" timestamp with time zone,
	"read_by_operator_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_messages_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "customer_conversations" ADD CONSTRAINT "customer_conversations_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_conversations" ADD CONSTRAINT "customer_conversations_workspace_customer_id_workspace_customers_id_fk" FOREIGN KEY ("workspace_customer_id") REFERENCES "public"."workspace_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_messages" ADD CONSTRAINT "customer_messages_conversation_id_customer_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."customer_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_messages" ADD CONSTRAINT "customer_messages_operator_user_id_quickengine_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."quickengine_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_conversations_workspace_recent_idx" ON "customer_conversations" USING btree ("workspace_id","last_message_at");--> statement-breakpoint
CREATE INDEX "customer_conversations_customer_recent_idx" ON "customer_conversations" USING btree ("workspace_customer_id","last_message_at");--> statement-breakpoint
CREATE INDEX "customer_messages_conversation_idx" ON "customer_messages" USING btree ("conversation_id","created_at");