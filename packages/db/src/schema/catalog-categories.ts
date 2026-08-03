import {
	type AnyPgColumn,
	boolean,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { catalogItems } from "./catalog-items";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG BROWSING STRUCTURE — categories and collections.
//
// 🔴 One table for both, distinguished by `kind`. A category is where a thing
// belongs ("Rings"); a collection is a curated grouping ("Summer picks"). They
// differ in meaning and in nothing else — same fields, same nesting, same
// membership — so two tables would be duplicated code and a second set of
// queries to keep in step.
//
// Surfaced by the prototype comparison on 2026-08-03: the catalog had no
// browsing structure at all, which makes a shop a flat list.
// ─────────────────────────────────────────────────────────────────────────────

export const catalogCategories = pgTable(
	"catalog_categories",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		kind: text("kind", { enum: ["category", "collection"] })
			.notNull()
			.default("category"),

		name: text("name").notNull(),

		/**
		 * The URL segment — `/shop/rings`.
		 *
		 * ⚠️ Unique **per workspace**, not globally. The prototype made this
		 * `.unique()` across the whole table, which means the first shop to create
		 * "rings" takes the word from every other shop on the platform. That is a
		 * multi-tenancy bug wearing a constraint.
		 */
		slug: text("slug").notNull(),

		description: text("description"),

		/**
		 * Parent, for nesting — Jewellery → Rings → Signet.
		 *
		 * ⚠️ `AnyPgColumn` breaks the self-reference's type inference cycle, same
		 * as `contracts-esign.ts`. Depth is not constrained here; the read path
		 * caps it, because a cycle introduced by hand should not be able to hang a
		 * storefront render.
		 */
		parentId: uuid("parent_id").references(
			(): AnyPgColumn => catalogCategories.id,
			{
				onDelete: "set null",
			},
		),

		/** Manual ordering. Ties break on name, so the result is always stable. */
		sortOrder: integer("sort_order").notNull().default(0),

		imageUrl: text("image_url"),

		/** Surfaced on a storefront's home page rather than only in navigation. */
		featured: boolean("featured").notNull().default(false),

		/**
		 * Hidden categories still exist and still hold their items.
		 *
		 * A seasonal collection is taken down and brought back, and deleting it
		 * would throw away the curation every time.
		 */
		visible: boolean("visible").notNull().default(true),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("catalog_categories_workspace_slug_key").on(
			table.workspaceId,
			table.slug,
		),
		index("catalog_categories_workspace_idx").on(table.workspaceId),
		index("catalog_categories_parent_idx").on(table.parentId),
	],
);

/**
 * Which items are in which category.
 *
 * 🔴 Many-to-many, not a `category_id` on the item. A gem belongs in "Rings"
 * AND in "Under £500" AND in "Summer picks" — modelling one category per item
 * forces a shop to pick, which is why the prototype's single `category` field
 * could not express collections at all.
 */
export const catalogItemCategories = pgTable(
	"catalog_item_categories",
	{
		catalogItemId: uuid("catalog_item_id")
			.notNull()
			.references(() => catalogItems.id, { onDelete: "cascade" }),
		categoryId: uuid("category_id")
			.notNull()
			.references(() => catalogCategories.id, { onDelete: "cascade" }),
		/** Ordering within this category, so a shop can merchandise a page. */
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// The pair IS the identity — an item cannot be in a category twice, and no
		// surrogate key is needed to say so.
		primaryKey({ columns: [table.catalogItemId, table.categoryId] }),
		index("catalog_item_categories_category_idx").on(table.categoryId),
	],
);
