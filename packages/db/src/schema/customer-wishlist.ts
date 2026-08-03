import {
	index,
	pgTable,
	primaryKey,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { catalogItems, catalogItemVariants } from "./catalog-items";
import { workspaceCustomers } from "./customers";

// ─────────────────────────────────────────────────────────────────────────────
// WISHLIST — things a shopper wants to come back to.
//
// 🔴 Keyed to `workspace_customers`, NOT to an identity and NOT to a
// `quickengine_user`. A wishlist belongs to one person AT ONE BUSINESS: the same
// shopper saving a gem at Gemsutopia and a lamp somewhere else has two lists,
// and neither shop can see the other's. That falls out of the membership row
// rather than needing a workspace column and a filter somebody has to remember.
//
// ⚠️ A GUEST has no membership and therefore no server-side wishlist. That is
// deliberate: storing one would mean minting an anonymous identity for every
// visitor who clicks a heart, which is a tracking cookie in all but name. A
// guest's list lives in their own browser and is merged on sign-in — see the
// merge route.
// ─────────────────────────────────────────────────────────────────────────────

export const customerWishlistItems = pgTable(
	"customer_wishlist_items",
	{
		workspaceCustomerId: uuid("workspace_customer_id")
			.notNull()
			.references(() => workspaceCustomers.id, { onDelete: "cascade" }),

		catalogItemId: uuid("catalog_item_id")
			.notNull()
			.references(() => catalogItems.id, { onDelete: "cascade" }),

		/**
		 * The specific option wanted, when the shopper picked one.
		 *
		 * Nullable because "I want this ring" and "I want this ring in size 7" are
		 * both real. `on delete set null` rather than cascade: retiring one size
		 * should leave the item on the list, not silently remove it.
		 */
		catalogItemVariantId: uuid("catalog_item_variant_id").references(
			() => catalogItemVariants.id,
			{ onDelete: "set null" },
		),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// 🔴 The pair IS the identity, so adding the same item twice is a no-op at
		// the database level rather than something every caller has to check. A
		// double-tapped heart cannot produce two rows.
		//
		// ⚠️ Note the variant is NOT in the key: wanting a ring in two sizes is one
		// entry in most shops' minds, and the alternative surprises people by
		// letting the same product appear on a list repeatedly.
		primaryKey({ columns: [table.workspaceCustomerId, table.catalogItemId] }),
		index("customer_wishlist_customer_idx").on(table.workspaceCustomerId),
		// "How many people saved this?" — a merchandising question worth answering
		// without scanning the table.
		index("customer_wishlist_item_idx").on(table.catalogItemId),
	],
);
