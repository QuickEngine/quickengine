import { sql } from "drizzle-orm";
import {
	check,
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
import { catalogItems, catalogItemVariants } from "./catalog-items";
import { clientRecords } from "./client-records";
import { fulfillments } from "./fulfillments";
import { quickengineWorkspaces } from "./quickengine";

export const orderSequences = pgTable(
	"order_sequences",
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
			name: "order_sequences_workspace_pk",
			columns: [table.workspaceId],
		}),
		check("order_sequences_positive_check", sql`${table.lastSequence} >= 0`),
	],
);

export const orders = pgTable(
	"orders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		clientId: uuid("client_id").references(() => clientRecords.id, {
			onDelete: "set null",
		}),
		clientName: text("client_name").notNull(),
		clientEmail: text("client_email"),
		fulfillmentId: uuid("fulfillment_id").references(() => fulfillments.id, {
			onDelete: "set null",
		}),
		sequence: integer("sequence").notNull(),
		number: text("number").notNull(),
		status: text("status", {
			enum: [
				"draft",
				"placed",
				"confirmed",
				"processing",
				"fulfilled",
				"cancelled",
			],
		})
			.notNull()
			.default("draft"),
		currency: text("currency").notNull().default("USD"),
		subtotalCents: integer("subtotal_cents").notNull(),
		totalCents: integer("total_cents").notNull(),
		notes: text("notes"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		placedAt: timestamp("placed_at", { withTimezone: true }),
		confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
		processingAt: timestamp("processing_at", { withTimezone: true }),
		fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("orders_workspace_idx").on(table.workspaceId),
		index("orders_workspace_status_idx").on(table.workspaceId, table.status),
		index("orders_client_idx").on(table.clientId),
		uniqueIndex("orders_workspace_sequence_unique").on(
			table.workspaceId,
			table.sequence,
		),
		uniqueIndex("orders_workspace_number_unique").on(
			table.workspaceId,
			table.number,
		),
		uniqueIndex("orders_fulfillment_unique").on(table.fulfillmentId),
	],
);

export const orderLineItems = pgTable(
	"order_line_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		orderId: uuid("order_id")
			.notNull()
			.references(() => orders.id, { onDelete: "cascade" }),
		catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, {
			onDelete: "set null",
		}),
		catalogItemVariantId: uuid("catalog_item_variant_id").references(
			() => catalogItemVariants.id,
			{ onDelete: "set null" },
		),
		variantOptions: jsonb("variant_options")
			.$type<Array<{ name: string; value: string }>>()
			.notNull()
			.default([]),
		name: text("name").notNull(),
		type: text("type", {
			enum: ["physical", "digital", "service", "package", "rental"],
		}).notNull(),
		sku: text("sku"),
		quantity: integer("quantity").notNull(),
		unitPriceCents: integer("unit_price_cents").notNull(),
		lineTotalCents: integer("line_total_cents").notNull(),
		position: integer("position").notNull(),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
	},
	(table) => [
		index("order_line_items_order_idx").on(table.orderId),
		index("order_line_items_variant_idx").on(table.catalogItemVariantId),
	],
);
