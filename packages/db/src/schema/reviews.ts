import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { catalogItems } from "./catalog-items";
import { clientRecords } from "./client-records";
import { orders } from "./orders";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWS — and the moderation queue, which is the actual feature.
//
// 🔴 Nothing a customer writes is public until an operator publishes it.
// `status` defaults to `pending`, and the storefront read filters on
// `published` in SQL. A shop owner asked for this so he can decide what appears
// on his front page.
//
// ⚠️ That is curation, not fabrication. A shop choosing WHICH real reviews to
// feature is ordinary; a shop writing its own is fraud. Nothing here creates a
// review without a customer, and `verifiedPurchase` records whether an order
// actually backs it — which is what keeps the distinction visible.
// ─────────────────────────────────────────────────────────────────────────────

export const REVIEW_STATUSES = [
	"pending",
	"published",
	// Rejected rather than deleted: a shop that removes what it dislikes should
	// leave a trail, and a customer asking "what happened to my review?" deserves
	// an answer that exists.
	"rejected",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const reviews = pgTable(
	"reviews",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		catalogItemId: uuid("catalog_item_id")
			.notNull()
			.references(() => catalogItems.id, { onDelete: "cascade" }),

		/**
		 * Who wrote it.
		 *
		 * ⚠️ A `client_record`, not a session. A guest who bought something and
		 * later verifies their email keeps authorship, because the order already
		 * points at the same record.
		 */
		clientRecordId: uuid("client_record_id")
			.notNull()
			.references(() => clientRecords.id, { onDelete: "cascade" }),

		/**
		 * The order that proves they bought it.
		 *
		 * Null for a review left without a purchase. `verifiedPurchase` is derived
		 * from this at write time and stored, so retiring an order later does not
		 * silently strip the badge from a review that earned it.
		 */
		orderId: uuid("order_id").references(() => orders.id, {
			onDelete: "set null",
		}),
		verifiedPurchase: boolean("verified_purchase").notNull().default(false),

		/** 1–5. Constrained by the write path, not by the column. */
		rating: integer("rating").notNull(),
		title: text("title"),
		body: text("body"),

		status: text("status", { enum: REVIEW_STATUSES })
			.notNull()
			.default("pending"),

		/**
		 * Who moderated it and when.
		 *
		 * ⚠️ Deliberately a plain text user id rather than a foreign key. An
		 * operator can be removed from a workspace, and losing the record of who
		 * approved a review is worse than a dangling reference.
		 */
		moderatedByUserId: text("moderated_by_user_id"),
		moderatedAt: timestamp("moderated_at", { withTimezone: true }),
		/** Why it was rejected. Internal — never shown to the customer. */
		moderationNote: text("moderation_note"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// 🔴 One review per customer per item. Without this, anyone can flood a
		// product with ratings from a single account, which makes the average
		// meaningless — and a shop's own average is the thing shoppers trust.
		unique("reviews_workspace_item_client_key").on(
			table.workspaceId,
			table.catalogItemId,
			table.clientRecordId,
		),
		// The storefront read: published reviews for one product.
		index("reviews_item_status_idx").on(table.catalogItemId, table.status),
		// The moderation queue: everything awaiting a decision in this workspace.
		index("reviews_workspace_status_idx").on(table.workspaceId, table.status),
	],
);
