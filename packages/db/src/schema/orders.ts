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
import { shippingRates } from "./shipping-rates";

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
		/**
		 * What a discount code took off, in minor units.
		 *
		 * 🔴 Stored, not derived. Recomputing it later from the code would give a
		 * different answer the moment the code's value changes or it expires — and
		 * an order is a record of what was agreed, not a re-evaluation of it.
		 *
		 * `total = subtotal - discount + shipping + tax`, and tax is computed on
		 * the DISCOUNTED subtotal PLUS shipping.
		 */
		discountCents: integer("discount_cents").notNull().default(0),
		/** Which code was used. Kept for the order view; the amount is authoritative. */
		discountCode: text("discount_code"),

		/**
		 * What the customer was charged to have it delivered.
		 *
		 * 🔴 Stored for the same reason `discountCents` is: rates change, zones get
		 * renamed, a rate gets deleted. An order records what was agreed. Never
		 * re-quote a placed order to find out what its shipping was.
		 */
		shippingCents: integer("shipping_cents").notNull().default(0),
		/**
		 * Which rate produced it, for support and reporting. `set null` on delete —
		 * losing the reference must never take `shippingCents` with it, because the
		 * amount is the part that has to survive.
		 */
		shippingRateId: uuid("shipping_rate_id").references(
			() => shippingRates.id,
			{
				onDelete: "set null",
			},
		),
		/** Human label at the time of the order — "Standard", "Express". */
		shippingRateName: text("shipping_rate_name"),

		// ── Where it ships, snapshotted ─────────────────────────────────────────
		//
		// 🔴 Copied onto the order, NOT a reference to `client_addresses`. A customer
		// who moves house must not retroactively change where a past order was
		// delivered — that record is what a dispute, a lost parcel and a tax audit
		// all rely on. This is the same reasoning as the line items storing their
		// own prices.
		//
		// Nullable as a block: plenty of orders ship nowhere at all (a service, a
		// booking, a digital download).
		shipToName: text("ship_to_name"),
		shipToLine1: text("ship_to_line1"),
		shipToLine2: text("ship_to_line2"),
		shipToCity: text("ship_to_city"),
		shipToRegion: text("ship_to_region"),
		shipToPostalCode: text("ship_to_postal_code"),
		/** ISO 3166-1 alpha-2, uppercase — the key zone matching runs on. */
		shipToCountryCode: text("ship_to_country_code"),

		/**
		 * Tax on this order, in minor units.
		 *
		 * 🔴 Added 2026-08-03. `orders` was the ONLY money table without it —
		 * `invoices` and `quote_estimates` both had `tax_cents` from the start — so
		 * the one record an e-commerce checkout writes could not represent tax at
		 * all. Selling a physical good to a Canadian or US buyer was not
		 * expressible. See Blocker 3 in `internal/planning/END_TO_END_AUDIT.md`.
		 *
		 * Defaults to 0 so every existing row stays arithmetically valid:
		 * `total = subtotal + 0` was already true of them.
		 *
		 * ⚠️ This column STORES tax. It does not decide it — see
		 * `modules/orders/src/tax.ts` for who computes the number.
		 */
		taxCents: integer("tax_cents").notNull().default(0),
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
