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
import { clientRecords } from "./client-records";
import { orders } from "./orders";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// DISCOUNTS — codes a shopper types at checkout.
//
// 🔴 Every amount is an INTEGER. The prototype stored `value` and
// `minimumOrderAmount` as `decimal`, which arrives from the driver as a string
// and gets parsed to a float by whoever forgets — and a float is how a 10% code
// takes £4.999999 off a £50 order. Percentages live in basis points, money in
// minor units, exactly as everywhere else in this codebase.
// ─────────────────────────────────────────────────────────────────────────────

export const DISCOUNT_VALUE_TYPES = ["percentage", "fixed"] as const;
export type DiscountValueType = (typeof DISCOUNT_VALUE_TYPES)[number];

export const discounts = pgTable(
	"discounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		/** What the operator calls it. Never shown to a shopper. */
		name: text("name").notNull(),

		/**
		 * What the shopper types.
		 *
		 * ⚠️ Stored UPPERCASED and matched case-insensitively by the write path.
		 * Somebody typing `summer10` must get the same answer as `SUMMER10`, and a
		 * shop must not be able to create both as separate codes.
		 */
		code: text("code").notNull(),

		valueType: text("value_type", { enum: DISCOUNT_VALUE_TYPES }).notNull(),

		/**
		 * Basis points when `percentage` (1000 = 10%), minor units when `fixed`.
		 *
		 * One column for both because a discount is never both at once, and two
		 * nullable columns would mean every read site checking which one is set.
		 */
		value: integer("value").notNull(),

		/** Order subtotal required before the code applies. Zero means no minimum. */
		minimumSubtotalCents: integer("minimum_subtotal_cents")
			.notNull()
			.default(0),

		/**
		 * Total redemptions allowed across everyone. Null means unlimited.
		 *
		 * ⚠️ `timesRedeemed` is authoritative and incremented in the same
		 * transaction as the order. Counting rows in `discount_redemptions` at
		 * checkout would race two shoppers spending the last use of a code.
		 */
		maxRedemptions: integer("max_redemptions"),
		timesRedeemed: integer("times_redeemed").notNull().default(0),

		/** Redemptions allowed per customer. Null means unlimited. */
		maxRedemptionsPerCustomer: integer("max_redemptions_per_customer"),

		/**
		 * Window. Both nullable — a code with neither is live until switched off.
		 *
		 * Kept separate from `active` so a seasonal code can be scheduled without
		 * anyone remembering to turn it on.
		 */
		startsAt: timestamp("starts_at", { withTimezone: true }),
		endsAt: timestamp("ends_at", { withTimezone: true }),

		/** The kill switch. Independent of the date window. */
		active: boolean("active").notNull().default(true),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// One code per workspace. Two shops may both run SUMMER10.
		unique("discounts_workspace_code_key").on(table.workspaceId, table.code),
		index("discounts_workspace_idx").on(table.workspaceId),
	],
);

/**
 * Who used what, and on which order.
 *
 * 🔴 Exists for the per-customer cap, which cannot be answered by a counter: a
 * shop limiting a code to one use per person needs to know WHICH people. It is
 * also the only audit trail of what a discount actually cost.
 *
 * ⚠️ Keyed on `clientRecordId`, not on a session or an email string. A guest
 * checkout resolves to a client record before the order is written, so the cap
 * survives somebody checking out as a guest twice with the same address.
 */
export const discountRedemptions = pgTable(
	"discount_redemptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		discountId: uuid("discount_id")
			.notNull()
			.references(() => discounts.id, { onDelete: "cascade" }),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		/** Who redeemed it. Null only if the order had no client at all. */
		clientRecordId: uuid("client_record_id").references(
			() => clientRecords.id,
			{
				onDelete: "set null",
			},
		),

		/**
		 * The order it was applied to.
		 *
		 * `set null` rather than cascade: deleting an order must not erase the
		 * record that a code was spent, or a cap could be reset by cancelling.
		 */
		orderId: uuid("order_id").references(() => orders.id, {
			onDelete: "set null",
		}),

		/** What it actually took off, in minor units. Snapshotted, not recomputed. */
		amountCents: integer("amount_cents").notNull(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("discount_redemptions_discount_idx").on(table.discountId),
		// The per-customer cap query: "how many times has this person used this
		// code?" — one index, one lookup.
		index("discount_redemptions_client_idx").on(
			table.discountId,
			table.clientRecordId,
		),
	],
);
