import { sql } from "drizzle-orm";
import {
	boolean,
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
import { quickengineWorkspaces } from "./quickengine";

/**
 * Outbound webhooks — how a workspace's events reach the customer's own servers.
 *
 * Two tables, because delivery must be isolated per endpoint. The outbox
 * dispatcher fans an event out into one `webhook_deliveries` row per subscribed
 * endpoint (a fast, database-only step), and a separate worker performs the HTTP
 * calls. If the HTTP call happened inside the outbox drain instead, one slow or
 * broken customer endpoint would stall every other workspace's events, and a
 * retry would redeliver to endpoints that had already succeeded.
 */

/** A customer-registered destination for a workspace's events. */
export const webhookEndpoints = pgTable(
	"webhook_endpoints",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		description: text("description"),
		/**
		 * The signing secret, encrypted at rest — never a hash. Unlike an API key,
		 * we must recover this value to sign every request, so it cannot be one-way.
		 */
		secretCiphertext: text("secret_ciphertext").notNull(),
		/**
		 * Event names this endpoint wants, e.g. ["invoice.paid"]. An empty array
		 * means every event: subscribing to everything is the common case, and it
		 * shouldn't require listing all 79 names.
		 */
		eventTypes: jsonb("event_types").$type<string[]>().notNull().default([]),
		enabled: boolean("enabled").notNull().default(true),
		/** Why the platform disabled it (sustained failures), if it did. */
		disabledReason: text("disabled_reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("webhook_endpoints_workspace_idx").on(table.workspaceId),
		// Fan-out reads only the endpoints that can currently receive something.
		index("webhook_endpoints_active_idx")
			.on(table.workspaceId)
			.where(sql`${table.enabled}`),
	],
);

export type WebhookDeliveryStatus =
	| "pending"
	| "succeeded"
	| "failed"
	| "exhausted";

/** One attempt-tracked delivery of one event to one endpoint. */
export const webhookDeliveries = pgTable(
	"webhook_deliveries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		endpointId: uuid("endpoint_id")
			.notNull()
			.references(() => webhookEndpoints.id, { onDelete: "cascade" }),
		/**
		 * The originating outbox event id. Sent to the customer as the event id so
		 * they can dedupe, and used here to make fan-out idempotent.
		 */
		eventId: uuid("event_id").notNull(),
		eventName: text("event_name").notNull(),
		payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
		status: text("status")
			.$type<WebhookDeliveryStatus>()
			.notNull()
			.default("pending"),
		attempts: integer("attempts").notNull().default(0),
		availableAt: timestamp("available_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		/** HTTP status from the last attempt, when one was received. */
		responseStatus: integer("response_status"),
		/** Truncated response body, kept for the customer to debug their endpoint. */
		responseBody: text("response_body"),
		/** Transport-level failure (timeout, DNS, TLS) — no HTTP status exists. */
		error: text("error"),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// Outbox delivery is at-least-once, so the same event can be dispatched
		// twice. This is what stops that becoming two HTTP calls to the customer.
		uniqueIndex("webhook_deliveries_endpoint_event_idx").on(
			table.endpointId,
			table.eventId,
		),
		// The delivery worker's claim query.
		index("webhook_deliveries_pending_idx")
			.on(table.availableAt)
			.where(sql`${table.status} = 'pending'`),
		// The customer's delivery-history view, newest first.
		index("webhook_deliveries_endpoint_created_idx").on(
			table.endpointId,
			table.createdAt,
		),
		index("webhook_deliveries_workspace_idx").on(table.workspaceId),
		check("webhook_deliveries_attempts_check", sql`${table.attempts} >= 0`),
	],
);
