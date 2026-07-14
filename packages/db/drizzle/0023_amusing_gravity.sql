CREATE TABLE "file_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid,
	"target_module_id" text NOT NULL,
	"target_record_type" text NOT NULL,
	"target_record_id" text NOT NULL,
	"role" text DEFAULT 'attachment' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"folder_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"current_version_number" integer,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"trashed_at" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_bucket" text DEFAULT 'documents' NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"category" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_reason" text,
	"available_at" timestamp with time zone,
	"quarantined_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_document_id_file_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."file_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_version_id_file_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."file_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_documents" ADD CONSTRAINT "file_documents_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_documents" ADD CONSTRAINT "file_documents_folder_id_file_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."file_folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_parent_id_file_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."file_folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_workspace_id_quickengine_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."quickengine_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_versions" ADD CONSTRAINT "file_versions_document_id_file_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."file_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_attachments_target_document_role_idx" ON "file_attachments" USING btree ("workspace_id","target_module_id","target_record_type","target_record_id","document_id","role");--> statement-breakpoint
CREATE INDEX "file_attachments_document_idx" ON "file_attachments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "file_attachments_version_idx" ON "file_attachments" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "file_attachments_target_idx" ON "file_attachments" USING btree ("workspace_id","target_module_id","target_record_type","target_record_id","position");--> statement-breakpoint
CREATE INDEX "file_documents_workspace_idx" ON "file_documents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "file_documents_workspace_status_idx" ON "file_documents" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "file_documents_folder_idx" ON "file_documents" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "file_folders_workspace_idx" ON "file_folders" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "file_folders_parent_idx" ON "file_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_folders_root_name_idx" ON "file_folders" USING btree ("workspace_id","normalized_name") WHERE "file_folders"."parent_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "file_folders_child_name_idx" ON "file_folders" USING btree ("workspace_id","parent_id","normalized_name") WHERE "file_folders"."parent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "file_versions_document_number_idx" ON "file_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "file_versions_storage_key_idx" ON "file_versions" USING btree ("storage_provider","storage_bucket","storage_key");--> statement-breakpoint
CREATE INDEX "file_versions_workspace_idx" ON "file_versions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "file_versions_document_idx" ON "file_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "file_versions_workspace_status_idx" ON "file_versions" USING btree ("workspace_id","status");