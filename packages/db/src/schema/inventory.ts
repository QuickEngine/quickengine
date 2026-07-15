import { sql } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { catalogItems, catalogItemVariants } from "./catalog-items";
import { quickengineWorkspaces } from "./quickengine";

export const inventoryItems = pgTable(
	"inventory_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		catalogItemId: uuid("catalog_item_id")
			.notNull()
			.references(() => catalogItems.id),
		catalogItemVariantId: uuid("catalog_item_variant_id").references(
			() => catalogItemVariants.id,
		),
		status: text("status", { enum: ["active", "archived"] })
			.notNull()
			.default("active"),
		onHand: integer("on_hand").notNull().default(0),
		reserved: integer("reserved").notNull().default(0),
		lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("inventory_items_workspace_idx").on(table.workspaceId),
		index("inventory_items_catalog_item_idx").on(table.catalogItemId),
		uniqueIndex("inventory_items_base_target_unique")
			.on(table.workspaceId, table.catalogItemId)
			.where(sql`${table.catalogItemVariantId} is null`),
		uniqueIndex("inventory_items_variant_target_unique")
			.on(table.workspaceId, table.catalogItemVariantId)
			.where(sql`${table.catalogItemVariantId} is not null`),
	],
);

export const inventoryAdjustments = pgTable(
	"inventory_adjustments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		inventoryItemId: uuid("inventory_item_id")
			.notNull()
			.references(() => inventoryItems.id, { onDelete: "cascade" }),
		kind: text("kind", {
			enum: [
				"receive",
				"sale",
				"customer_return",
				"damage",
				"correction_in",
				"correction_out",
				"reserve",
				"release",
				"fulfill_reserved",
			],
		}).notNull(),
		quantity: integer("quantity").notNull(),
		onHandDelta: integer("on_hand_delta").notNull(),
		reservedDelta: integer("reserved_delta").notNull(),
		resultingOnHand: integer("resulting_on_hand").notNull(),
		resultingReserved: integer("resulting_reserved").notNull(),
		note: text("note"),
		referenceId: uuid("reference_id"),
		idempotencyKey: text("idempotency_key"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("inventory_adjustments_workspace_idx").on(table.workspaceId),
		index("inventory_adjustments_item_idx").on(table.inventoryItemId),
		index("inventory_adjustments_reference_idx").on(table.referenceId),
		uniqueIndex("inventory_adjustments_idempotency_unique")
			.on(table.workspaceId, table.idempotencyKey)
			.where(sql`${table.idempotencyKey} is not null`),
	],
);
