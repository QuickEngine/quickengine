import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineOrganizations, quickengineWorkspaces } from "./quickengine";

export type ApiMutationState = "pending" | "completed";

export const apiMutations = pgTable(
	"api_mutations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id").references(
			() => quickengineOrganizations.id,
			{ onDelete: "set null" },
		),
		operation: text("operation").notNull(),
		idempotencyKey: text("idempotency_key").notNull(),
		fingerprint: text("fingerprint").notNull(),
		state: text("state").$type<ApiMutationState>().notNull().default("pending"),
		actorType: text("actor_type").notNull(),
		actorId: text("actor_id").notNull(),
		requestId: text("request_id").notNull(),
		source: text("source").notNull(),
		responseStatus: integer("response_status"),
		responseBody: jsonb("response_body").$type<unknown>(),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("api_mutations_workspace_operation_key_idx").on(
			table.workspaceId,
			table.operation,
			table.idempotencyKey,
		),
		index("api_mutations_started_idx").on(table.startedAt),
		check(
			"api_mutations_completed_result_check",
			sql`${table.state} <> 'completed' or (${table.responseStatus} is not null and ${table.completedAt} is not null)`,
		),
	],
);

export const apiAuditEvents = pgTable(
	"api_audit_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id").references(
			() => quickengineOrganizations.id,
			{ onDelete: "set null" },
		),
		actorType: text("actor_type").notNull(),
		actorId: text("actor_id").notNull(),
		action: text("action").notNull(),
		resourceType: text("resource_type").notNull(),
		resourceId: text("resource_id").notNull(),
		requestId: text("request_id").notNull(),
		source: text("source").notNull(),
		metadata: jsonb("metadata")
			.$type<Record<string, string | number | boolean | null>>()
			.notNull()
			.default({}),
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("api_audit_events_workspace_time_idx").on(
			table.workspaceId,
			table.occurredAt,
		),
		index("api_audit_events_resource_idx").on(
			table.workspaceId,
			table.resourceType,
			table.resourceId,
		),
	],
);

export const apiOutboxEvents = pgTable(
	"api_outbox_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		aggregateType: text("aggregate_type").notNull(),
		aggregateId: text("aggregate_id").notNull(),
		eventName: text("event_name").notNull(),
		version: integer("version").notNull(),
		payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
		requestId: text("request_id").notNull(),
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		availableAt: timestamp("available_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		attempts: integer("attempts").notNull().default(0),
		publishedAt: timestamp("published_at", { withTimezone: true }),
	},
	(table) => [
		index("api_outbox_events_pending_idx")
			.on(table.availableAt)
			.where(sql`${table.publishedAt} is null`),
		check("api_outbox_events_version_check", sql`${table.version} > 0`),
		check("api_outbox_events_attempts_check", sql`${table.attempts} >= 0`),
	],
);
