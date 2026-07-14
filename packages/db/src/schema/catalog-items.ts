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
import { quickengineWorkspaces } from "./quickengine";

// Products & Services owns the workspace's catalog of things it sells or offers.
// Inventory, ordering, booking, fulfillment, files, and tax remain separate modules.
export const catalogItems = pgTable(
	"catalog_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		type: text("type", {
			enum: ["physical", "digital", "service", "package", "rental"],
		}).notNull(),
		status: text("status", { enum: ["draft", "active", "archived"] })
			.notNull()
			.default("draft"),
		sku: text("sku"),
		pricingModel: text("pricing_model", {
			enum: ["fixed", "starting_at", "hourly", "custom_quote", "free"],
		})
			.notNull()
			.default("fixed"),
		priceCents: integer("price_cents"),
		currency: text("currency").notNull().default("USD"),
		unitLabel: text("unit_label"),
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
		index("catalog_items_workspace_idx").on(table.workspaceId),
		index("catalog_items_workspace_status_idx").on(
			table.workspaceId,
			table.status,
		),
		uniqueIndex("catalog_items_workspace_sku_unique")
			.on(table.workspaceId, table.sku)
			.where(sql`${table.sku} is not null`),
	],
);

export const catalogItemVariants = pgTable(
	"catalog_item_variants",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		catalogItemId: uuid("catalog_item_id")
			.notNull()
			.references(() => catalogItems.id, { onDelete: "cascade" }),
		combinationKey: text("combination_key").notNull(),
		options: jsonb("options")
			.$type<Array<{ name: string; value: string }>>()
			.notNull(),
		status: text("status", { enum: ["draft", "active", "archived"] })
			.notNull()
			.default("draft"),
		sku: text("sku"),
		priceCentsOverride: integer("price_cents_override"),
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
		index("catalog_item_variants_workspace_idx").on(table.workspaceId),
		index("catalog_item_variants_item_idx").on(table.catalogItemId),
		uniqueIndex("catalog_item_variants_combination_unique").on(
			table.catalogItemId,
			table.combinationKey,
		),
		uniqueIndex("catalog_item_variants_workspace_sku_unique")
			.on(table.workspaceId, table.sku)
			.where(sql`${table.sku} is not null`),
	],
);
