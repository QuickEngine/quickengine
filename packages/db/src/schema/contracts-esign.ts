import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	check,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { clientRecords } from "./client-records";
import { fileVersions } from "./files";
import { quickengineWorkspaces } from "./quickengine";

export const contractSequences = pgTable(
	"contract_sequences",
	{
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		lastSequence: integer("last_sequence").notNull().default(0),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			name: "contract_sequences_workspace_pk",
			columns: [table.workspaceId],
		}),
		check("contract_sequences_positive_check", sql`${table.lastSequence} >= 0`),
	],
);

export const contracts = pgTable(
	"contracts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		seriesId: uuid("series_id").notNull(),
		supersedesId: uuid("supersedes_id").references(
			(): AnyPgColumn => contracts.id,
			{ onDelete: "restrict" },
		),
		clientId: uuid("client_id").references(() => clientRecords.id, {
			onDelete: "set null",
		}),
		clientName: text("client_name").notNull(),
		clientEmail: text("client_email"),
		clientCompany: text("client_company"),
		fileVersionId: uuid("file_version_id")
			.notNull()
			.references(() => fileVersions.id, { onDelete: "restrict" }),
		fileDocumentId: uuid("file_document_id").notNull(),
		fileName: text("file_name").notNull(),
		fileContentType: text("file_content_type").notNull(),
		fileChecksumSha256: text("file_checksum_sha256").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		numberPrefix: text("number_prefix").notNull(),
		sequence: integer("sequence").notNull(),
		revision: integer("revision").notNull().default(1),
		number: text("number").notNull(),
		status: text("status", {
			enum: [
				"draft",
				"sent",
				"partially_signed",
				"completed",
				"declined",
				"expired",
				"voided",
				"superseded",
			],
		})
			.notNull()
			.default("draft"),
		effectiveOn: date("effective_on", { mode: "string" }),
		endsOn: date("ends_on", { mode: "string" }),
		consentText: text("consent_text"),
		consentVersion: text("consent_version"),
		signingExpiresAt: timestamp("signing_expires_at", { withTimezone: true }),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		partiallySignedAt: timestamp("partially_signed_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		declinedAt: timestamp("declined_at", { withTimezone: true }),
		expiredAt: timestamp("expired_at", { withTimezone: true }),
		voidedAt: timestamp("voided_at", { withTimezone: true }),
		supersededAt: timestamp("superseded_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("contracts_workspace_idx").on(table.workspaceId),
		index("contracts_workspace_status_idx").on(table.workspaceId, table.status),
		index("contracts_client_idx").on(table.clientId),
		index("contracts_file_version_idx").on(table.fileVersionId),
		index("contracts_series_idx").on(table.workspaceId, table.seriesId),
		uniqueIndex("contracts_workspace_number_idx").on(
			table.workspaceId,
			table.number,
		),
		uniqueIndex("contracts_series_revision_idx").on(
			table.workspaceId,
			table.seriesId,
			table.revision,
		),
		uniqueIndex("contracts_supersedes_idx")
			.on(table.supersedesId)
			.where(sql`${table.supersedesId} is not null`),
		check(
			"contracts_revision_positive_check",
			sql`${table.sequence} > 0 and ${table.revision} > 0`,
		),
		check(
			"contracts_dates_check",
			sql`${table.endsOn} is null or ${table.effectiveOn} is null or ${table.endsOn} >= ${table.effectiveOn}`,
		),
	],
);

export const contractSigners = pgTable(
	"contract_signers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		contractId: uuid("contract_id")
			.notNull()
			.references(() => contracts.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		email: text("email").notNull(),
		role: text("role"),
		position: integer("position").notNull(),
		status: text("status", { enum: ["pending", "signed", "declined"] })
			.notNull()
			.default("pending"),
		tokenHash: text("token_hash"),
		tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
		viewedAt: timestamp("viewed_at", { withTimezone: true }),
		typedName: text("typed_name"),
		consentText: text("consent_text"),
		consentVersion: text("consent_version"),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		signedAt: timestamp("signed_at", { withTimezone: true }),
		declinedAt: timestamp("declined_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("contract_signers_contract_idx").on(table.contractId, table.position),
		index("contract_signers_workspace_idx").on(table.workspaceId),
		uniqueIndex("contract_signers_contract_email_idx").on(
			table.contractId,
			table.email,
		),
		uniqueIndex("contract_signers_token_hash_idx")
			.on(table.tokenHash)
			.where(sql`${table.tokenHash} is not null`),
		check("contract_signers_position_check", sql`${table.position} >= 0`),
	],
);

export const contractAuditEvents = pgTable(
	"contract_audit_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		contractId: uuid("contract_id")
			.notNull()
			.references(() => contracts.id, { onDelete: "cascade" }),
		signerId: uuid("signer_id").references(() => contractSigners.id, {
			onDelete: "set null",
		}),
		eventType: text("event_type").notNull(),
		actorType: text("actor_type", {
			enum: ["workspace_user", "signer", "system"],
		}).notNull(),
		actorId: text("actor_id"),
		details: jsonb("details")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("contract_audit_contract_idx").on(table.contractId, table.occurredAt),
		index("contract_audit_workspace_idx").on(table.workspaceId),
	],
);
