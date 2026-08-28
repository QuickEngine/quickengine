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
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLIERS — who actually makes and ships the thing a business sells.
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// A business that holds its own stock never needs this: it picks, packs and
// ships, and `shipments` is the whole story. A business that does NOT touch its
// product needs somewhere to record who does, and the map from what it sells to
// what that supplier calls the same thing. Without that map the handoff is a
// human reading an order and typing a code from memory, which is fine at three
// orders a day and is a source of wrong coffee at thirty.
//
// 🔴 There is deliberately NO credential column here, and no endpoint secret.
// The supplier's preferred handoff — API, CSV, email, a portal — is not known
// until the supplier says so, and `shipping-rates.ts` already records why
// speculative columns are harmful: an unused column invites somebody to trust it
// later. Credentials arrive with the adapter that needs them, encrypted the way
// `provider-credentials.ts` encrypts a business's payment secrets.
//
// ⚠️ This models the RELATIONSHIP, not the integration. It is what a person
// needs in front of them to place an order by hand today, and exactly what an
// adapter will need to place one automatically later.
// ─────────────────────────────────────────────────────────────────────────────

export const suppliers = pgTable(
	"suppliers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		contactName: text("contact_name"),
		contactEmail: text("contact_email"),
		contactPhone: text("contact_phone"),
		/**
		 * How orders are expected to reach this supplier.
		 *
		 * 🔑 `unknown` is the default and is an honest state, not a missing value:
		 * a supplier can be recorded before anybody has agreed how orders will be
		 * sent. Nothing reads this to decide behaviour yet — it is what a person
		 * needs to know, and later what picks an adapter.
		 *
		 * ⚠️ `shopify` and `woocommerce` are here because suppliers commonly ingest
		 * orders through a storefront platform rather than an API of their own. A
		 * supplier on that path is NOT integrated by writing their API client; it
		 * is integrated by satisfying the platform's contract, which is a
		 * different and much larger piece of work. Recording it as its own method
		 * keeps that distinction visible instead of discovering it late.
		 *
		 * 🔴 Widening this list needs no migration: the column is plain `text` and
		 * the enum is enforced in TypeScript and by the zod schema, not by a CHECK
		 * constraint. Verified against the live table — zero check constraints.
		 */
		handoffMethod: text("handoff_method", {
			enum: [
				"unknown",
				"manual",
				"email",
				"csv",
				"api",
				"portal",
				"shopify",
				"woocommerce",
			],
		})
			.notNull()
			.default("unknown"),
		/**
		 * Where the handoff goes: an address for email, a URL for a portal or an
		 * API base. One column because exactly one is meaningful at a time, and
		 * which one is already said by `handoffMethod`.
		 */
		handoffTarget: text("handoff_target"),
		/** Working days between the supplier receiving an order and shipping it. */
		leadTimeDays: integer("lead_time_days"),
		notes: text("notes"),
		/**
		 * Let a SANDBOX order actually reach this supplier.
		 *
		 * 🔴 Off by default, and it must stay that way. The sandbox guard exists
		 * because supplier connections carry no mode — one Shopify store, one
		 * token, one Collective link — so without it a test checkout placed a
		 * genuine order and a supplier shipped real goods for a sale that never
		 * happened.
		 *
		 * 🔑 The danger is a supplier who does not KNOW a rehearsal is coming. Once
		 * one has agreed to receive tests, that danger is gone for them and nobody
		 * else, which is why this is per-supplier rather than a workspace switch —
		 * a workspace-wide flag would also un-guard every supplier who never
		 * agreed to anything.
		 *
		 * ⚠️ What is sent while this is on is marked as a test in its subject and
		 * body, so a supplier who forgets cannot mistake it for a real order.
		 */
		sandboxHandoffEnabled: boolean("sandbox_handoff_enabled")
			.notNull()
			.default(false),
		/**
		 * Archived rather than deleted: orders already sent to a supplier must keep
		 * naming who fulfilled them long after the relationship ends.
		 */
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("suppliers_workspace_idx").on(table.workspaceId)],
);

/**
 * What this business sells ↔ what the supplier calls it.
 *
 * 🔴 The mapping is the entire point of the table. Every fulfillment method —
 * API, CSV, an email typed by hand — needs to turn "Ethiopia Guji, 340g" into
 * the supplier's own code, and getting it wrong ships the wrong product to a
 * paying customer.
 *
 * ⚠️ `unitCostCents` is what the BUSINESS pays the supplier, never what its
 * customer pays. Keeping the two apart is what makes margin calculable at all;
 * the sale price lives on the catalog item, where it always has.
 */
export const supplierSkus = pgTable(
	"supplier_skus",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		supplierId: uuid("supplier_id")
			.notNull()
			.references(() => suppliers.id, { onDelete: "cascade" }),
		catalogItemId: uuid("catalog_item_id")
			.notNull()
			.references(() => catalogItems.id, { onDelete: "cascade" }),
		/** The supplier's own identifier. Sent verbatim; never parsed. */
		supplierSku: text("supplier_sku").notNull(),
		/** What the supplier calls it, when that differs from what we call it. */
		supplierName: text("supplier_name"),
		/** Integer cents, like every other money column in this schema. */
		unitCostCents: integer("unit_cost_cents"),
		currency: text("currency").notNull().default("USD"),
		/** Overrides the supplier's default when one item is slower than the rest. */
		leadTimeDays: integer("lead_time_days"),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("supplier_skus_workspace_idx").on(table.workspaceId),
		index("supplier_skus_supplier_idx").on(table.supplierId),
		index("supplier_skus_item_idx").on(table.catalogItemId),
		/**
		 * 🔴 One mapping per item per supplier. Two rows for the same pair means
		 * the handoff has to guess which code to send, and a guess here ships the
		 * wrong thing. A second supplier for the same item is a different row and
		 * is allowed on purpose — that is how a business fails over.
		 */
		unique("supplier_skus_supplier_item_unique").on(
			table.supplierId,
			table.catalogItemId,
		),
	],
);
