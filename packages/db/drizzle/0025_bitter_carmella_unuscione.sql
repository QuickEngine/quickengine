CREATE TABLE "contract_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"signer_id" uuid,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_sequences" (
	"workspace_id" uuid NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_sequences_workspace_pk" PRIMARY KEY("workspace_id"),
	CONSTRAINT "contract_sequences_positive_check" CHECK ("contract_sequences"."last_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contract_signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"position" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"typed_name" text,
	"consent_text" text,
	"consent_version" text,
	"ip_address" text,
	"user_agent" text,
	"signed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_signers_position_check" CHECK ("contract_signers"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"supersedes_id" uuid,
	"client_id" uuid,
	"client_name" text NOT NULL,
	"client_email" text,
	"client_company" text,
	"file_version_id" uuid NOT NULL,
	"file_document_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_content_type" text NOT NULL,
	"file_checksum_sha256" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"number_prefix" text NOT NULL,
	"sequence" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_on" date,
	"ends_on" date,
	"consent_text" text,
	"consent_version" text,
	"signing_expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"partially_signed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_revision_positive_check" CHECK ("contracts"."sequence" > 0 and "contracts"."revision" > 0),
	CONSTRAINT "contracts_dates_check" CHECK ("contracts"."ends_on" is null or "contracts"."effective_on" is null or "contracts"."ends_on" >= "contracts"."effective_on")
);
--> statement-breakpoint
ALTER TABLE "contract_audit_events" ADD CONSTRAINT "contract_audit_events_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_audit_events" ADD CONSTRAINT "contract_audit_events_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_audit_events" ADD CONSTRAINT "contract_audit_events_signer_id_contract_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."contract_signers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_sequences" ADD CONSTRAINT "contract_sequences_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signers" ADD CONSTRAINT "contract_signers_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signers" ADD CONSTRAINT "contract_signers_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supersedes_id_contracts_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_client_records_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_file_version_id_file_versions_id_fk" FOREIGN KEY ("file_version_id") REFERENCES "public"."file_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_audit_contract_idx" ON "contract_audit_events" USING btree ("contract_id","occurred_at");--> statement-breakpoint
CREATE INDEX "contract_audit_workspace_idx" ON "contract_audit_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "contract_signers_contract_idx" ON "contract_signers" USING btree ("contract_id","position");--> statement-breakpoint
CREATE INDEX "contract_signers_workspace_idx" ON "contract_signers" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_signers_contract_email_idx" ON "contract_signers" USING btree ("contract_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_signers_token_hash_idx" ON "contract_signers" USING btree ("token_hash") WHERE "contract_signers"."token_hash" is not null;--> statement-breakpoint
CREATE INDEX "contracts_workspace_idx" ON "contracts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "contracts_workspace_status_idx" ON "contracts" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "contracts_client_idx" ON "contracts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "contracts_file_version_idx" ON "contracts" USING btree ("file_version_id");--> statement-breakpoint
CREATE INDEX "contracts_series_idx" ON "contracts" USING btree ("workspace_id","series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_workspace_number_idx" ON "contracts" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_series_revision_idx" ON "contracts" USING btree ("workspace_id","series_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_supersedes_idx" ON "contracts" USING btree ("supersedes_id") WHERE "contracts"."supersedes_id" is not null;