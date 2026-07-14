import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";

export const fileFolders = pgTable(
	"file_folders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		parentId: uuid("parent_id").references((): AnyPgColumn => fileFolders.id, {
			onDelete: "restrict",
		}),
		name: text("name").notNull(),
		normalizedName: text("normalized_name").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("file_folders_workspace_idx").on(table.workspaceId),
		index("file_folders_parent_idx").on(table.parentId),
		uniqueIndex("file_folders_root_name_idx")
			.on(table.workspaceId, table.normalizedName)
			.where(sql`${table.parentId} is null`),
		uniqueIndex("file_folders_child_name_idx")
			.on(table.workspaceId, table.parentId, table.normalizedName)
			.where(sql`${table.parentId} is not null`),
	],
);

export const fileDocuments = pgTable(
	"file_documents",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			// External object bytes must be purged before their owning workspace can
			// disappear; restricting here prevents untracked storage orphans.
			.references(() => quickengineWorkspaces.id, { onDelete: "restrict" }),
		folderId: uuid("folder_id").references(() => fileFolders.id, {
			onDelete: "restrict",
		}),
		title: text("title").notNull(),
		description: text("description"),
		status: text("status", {
			enum: ["active", "archived", "trashed", "deleting"],
		})
			.notNull()
			.default("active"),
		currentVersionNumber: integer("current_version_number"),
		tags: jsonb("tags").$type<string[]>().notNull().default([]),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		trashedAt: timestamp("trashed_at", { withTimezone: true }),
		deletionRequestedAt: timestamp("deletion_requested_at", {
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("file_documents_workspace_idx").on(table.workspaceId),
		index("file_documents_workspace_status_idx").on(
			table.workspaceId,
			table.status,
		),
		index("file_documents_folder_idx").on(table.folderId),
	],
);

export const fileVersions = pgTable(
	"file_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		documentId: uuid("document_id")
			.notNull()
			.references(() => fileDocuments.id, { onDelete: "cascade" }),
		versionNumber: integer("version_number").notNull(),
		status: text("status", {
			enum: ["pending", "available", "failed", "quarantined"],
		})
			.notNull()
			.default("pending"),
		storageProvider: text("storage_provider").notNull(),
		storageBucket: text("storage_bucket").notNull().default("documents"),
		storageKey: text("storage_key").notNull(),
		originalName: text("original_name").notNull(),
		contentType: text("content_type").notNull(),
		category: text("category", {
			enum: [
				"document",
				"spreadsheet",
				"presentation",
				"pdf",
				"image",
				"audio",
				"video",
				"archive",
				"code",
				"other",
			],
		}).notNull(),
		sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
		checksumSha256: text("checksum_sha256").notNull(),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		failureReason: text("failure_reason"),
		availableAt: timestamp("available_at", { withTimezone: true }),
		quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
		failedAt: timestamp("failed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("file_versions_document_number_idx").on(
			table.documentId,
			table.versionNumber,
		),
		uniqueIndex("file_versions_storage_key_idx").on(
			table.storageProvider,
			table.storageBucket,
			table.storageKey,
		),
		index("file_versions_workspace_idx").on(table.workspaceId),
		index("file_versions_document_idx").on(table.documentId),
		index("file_versions_workspace_status_idx").on(
			table.workspaceId,
			table.status,
		),
	],
);

export const fileAttachments = pgTable(
	"file_attachments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		documentId: uuid("document_id")
			.notNull()
			.references(() => fileDocuments.id, { onDelete: "cascade" }),
		versionId: uuid("version_id").references(() => fileVersions.id, {
			onDelete: "restrict",
		}),
		targetModuleId: text("target_module_id").notNull(),
		targetRecordType: text("target_record_type").notNull(),
		targetRecordId: text("target_record_id").notNull(),
		role: text("role", {
			enum: ["attachment", "reference", "deliverable", "source", "other"],
		})
			.notNull()
			.default("attachment"),
		position: integer("position").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("file_attachments_target_document_role_idx").on(
			table.workspaceId,
			table.targetModuleId,
			table.targetRecordType,
			table.targetRecordId,
			table.documentId,
			table.role,
		),
		index("file_attachments_document_idx").on(table.documentId),
		index("file_attachments_version_idx").on(table.versionId),
		index("file_attachments_target_idx").on(
			table.workspaceId,
			table.targetModuleId,
			table.targetRecordType,
			table.targetRecordId,
			table.position,
		),
	],
);
