import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { orderLineItems, orders } from "./orders";
import { quickengineWorkspaces } from "./quickengine";
import { suppliers } from "./suppliers";

// ─────────────────────────────────────────────────────────────────────────────
// PURCHASE ORDERS — what a business asked a supplier to send, and where it got to.
//
// ── Why a record and not just an email ───────────────────────────────────────
//
// 🔴 The handoff writes a ROW and then notifies. The obvious shortcut is to mail
// the supplier when an order is paid and consider the job done, and it leaves
// the business with no record of what it asked for, no status, and nowhere for a
// tracking number to come back to. The first time a parcel goes missing there is
// nothing to point at but a sent-mail folder.
//
// ── Why one per (order, supplier) ────────────────────────────────────────────
//
// An order whose lines come from two suppliers becomes two purchase orders,
// because they are two separate asks of two separate businesses. The unique
// constraint below is what makes the whole pipeline safe to retry: `order.paid`
// is delivered at least once, and without it a redelivery sends a supplier a
// second order for goods they have already shipped.
//
// ⚠️ Deliberately NOT a copy of the order. It carries what the SUPPLIER needs —
// their own SKU, the quantity, the address to send it to — and nothing about how
// much the customer paid. A supplier has no business seeing a retail margin.

export const purchaseOrders = pgTable(
	"purchase_orders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		supplierId: uuid("supplier_id")
			.notNull()
			.references(() => suppliers.id, { onDelete: "restrict" }),
		/**
		 * The customer order this was raised from.
		 *
		 * Nullable so a business can raise a purchase order to restock its own
		 * shelves, which has no customer order behind it. Dropship is the case that
		 * exists today; restocking is the one the shape must not preclude.
		 */
		orderId: uuid("order_id").references(() => orders.id, {
			onDelete: "set null",
		}),
		/** Human reference, e.g. `PO-0001`. Sequenced per workspace. */
		number: text("number").notNull(),
		/**
		 * ⚠️ `sending` is a CLAIM, not a state anybody sets by hand.
		 *
		 * An automated handoff moves `draft -> sending` with a conditional update
		 * before it calls the supplier, so only the writer that won the update
		 * makes the call. Without it, two workers draining the same at-least-once
		 * event both place the order and the supplier ships twice.
		 *
		 * Widening this list needs no migration: the column is plain `text` with
		 * the set enforced in TypeScript, and the live table carries zero check
		 * constraints (verified 2026-08-21).
		 */
		status: text("status", {
			enum: [
				"draft",
				"sending",
				"sent",
				"acknowledged",
				"shipped",
				"received",
				"cancelled",
				"failed",
				/**
				 * 🔴 Refused on purpose, not broken.
				 *
				 * A sandbox order must never reach a real supplier — they would
				 * pick, pack and ship real goods for a sale that never happened.
				 * The purchase order is still raised so an operator can see what
				 * WOULD have been asked for.
				 *
				 * ⚠️ Its own state rather than `failed`. In a live workspace
				 * `failed` means a supplier genuinely never got an order and
				 * somebody has to act; if a deliberate sandbox skip looks the same,
				 * the real one gets scrolled past.
				 */
				"skipped_sandbox",
			],
		})
			.notNull()
			.default("draft"),
		/**
		 * How this was handed over, copied from the supplier at the moment of
		 * sending.
		 *
		 * 🔴 A SNAPSHOT, not a join. A supplier who later switches from email to an
		 * API must not rewrite the history of how past orders were actually sent —
		 * that is the record somebody reads when working out why one went astray.
		 */
		handoffMethod: text("handoff_method").notNull().default("unknown"),
		/** Where it went: an address, an endpoint, a portal reference. */
		handoffTarget: text("handoff_target"),
		/** Why it was not sent, for `failed` and `skipped_sandbox` alike. */
		failureReason: text("failure_reason"),
		/** What the supplier called it back, once they say. */
		supplierReference: text("supplier_reference"),
		carrier: text("carrier"),
		trackingNumber: text("tracking_number"),
		trackingUrl: text("tracking_url"),
		/** Where the supplier is sending it. Snapshotted from the order. */
		shipToName: text("ship_to_name"),
		shipToLine1: text("ship_to_line1"),
		shipToLine2: text("ship_to_line2"),
		shipToCity: text("ship_to_city"),
		shipToRegion: text("ship_to_region"),
		shipToPostalCode: text("ship_to_postal_code"),
		shipToCountryCode: text("ship_to_country_code"),
		notes: text("notes"),
		metadata: jsonb("metadata").notNull().default({}),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
		receivedAt: timestamp("received_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("purchase_orders_workspace_idx").on(table.workspaceId),
		index("purchase_orders_supplier_idx").on(table.supplierId),
		index("purchase_orders_order_idx").on(table.orderId),
		index("purchase_orders_status_idx").on(table.workspaceId, table.status),
		/**
		 * The join key for anything a supplier sends back.
		 *
		 * An inbound fulfilment webhook knows the supplier's own order id and
		 * nothing else, so this lookup happens on every delivery — including the
		 * redeliveries that at-least-once guarantees.
		 */
		index("purchase_orders_supplier_reference_idx").on(
			table.workspaceId,
			table.supplierReference,
		),
		/**
		 * 🔴 THE constraint that makes the pipeline safe to retry.
		 *
		 * `order.paid` is delivered at least once. Without this a redelivery raises
		 * a second purchase order and a supplier ships the same coffee twice, at
		 * the business's expense, silently. Same reasoning as
		 * `subscription_cycles_period_unique`.
		 */
		unique("purchase_orders_order_supplier_unique").on(
			table.orderId,
			table.supplierId,
		),
		unique("purchase_orders_workspace_number_unique").on(
			table.workspaceId,
			table.number,
		),
	],
);

export const purchaseOrderLines = pgTable(
	"purchase_order_lines",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		purchaseOrderId: uuid("purchase_order_id")
			.notNull()
			.references(() => purchaseOrders.id, { onDelete: "cascade" }),
		/**
		 * The customer order line this fulfils, where there is one.
		 *
		 * `set null` rather than cascade: deleting an order must not silently erase
		 * the record of what a supplier was asked to send and may already have sent.
		 */
		orderLineItemId: uuid("order_line_item_id").references(
			() => orderLineItems.id,
			{ onDelete: "set null" },
		),
		/**
		 * What the SUPPLIER calls it, snapshotted.
		 *
		 * ⚠️ Not a reference to `supplier_skus`. A supplier renumbering their
		 * catalog must not rewrite what was on a purchase order that has already
		 * been sent and possibly shipped.
		 */
		supplierSku: text("supplier_sku").notNull(),
		/** What the business calls it, so the row is readable without a join. */
		description: text("description").notNull(),
		quantity: integer("quantity").notNull(),
		/** What the business expects to pay per unit, snapshotted at send. */
		unitCostCents: integer("unit_cost_cents"),
		currency: text("currency").notNull().default("CAD"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("purchase_order_lines_po_idx").on(table.purchaseOrderId),
		index("purchase_order_lines_order_line_idx").on(table.orderLineItemId),
		/** One row per line per purchase order; quantity carries the count. */
		unique("purchase_order_lines_po_line_unique").on(
			table.purchaseOrderId,
			table.orderLineItemId,
		),
	],
);

/** Per-workspace numbering, the same shape as orders and invoices. */
export const purchaseOrderSequences = pgTable("purchase_order_sequences", {
	workspaceId: uuid("workspace_id")
		.primaryKey()
		.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
	nextNumber: integer("next_number").notNull().default(1),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
