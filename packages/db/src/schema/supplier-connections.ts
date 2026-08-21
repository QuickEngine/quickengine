import {
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { quickengineWorkspaces } from "./quickengine";
import { suppliers } from "./suppliers";

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLIER CONNECTIONS — the credential and live state for one automated handoff.
//
// ── Why this is not a column on `suppliers` ──────────────────────────────────
//
// `suppliers.ts` says outright that it holds no credential and that credentials
// "arrive with the adapter that needs them". This is that arrival, and it stays
// separate for three reasons that all bite in practice:
//
// 1. `raisePurchaseOrdersForOrder` does an unqualified `select().from(suppliers)`
//    on every paid order. A credential column would be read into memory — and
//    into anything that ever logs that row — on the busiest path in the system.
//    A separate table is only loaded by code that asks for it by name.
// 2. `suppliers` models the RELATIONSHIP; this models one INTEGRATION with it.
//    A connection has status, a last error and a last verified time, none of
//    which `suppliers` has anywhere sensible to put.
// 3. It mirrors `payment_accounts.credentials`, which is the shape this codebase
//    already trusts: one row per (workspace, provider), secret encrypted at rest,
//    never readable back.
//
// ⚠️ `suppliers.handoffMethod` still decides HOW a supplier is reached, and
// `handoffTarget` still carries the human-readable address. This carries the
// secret and whether the connection currently works. A supplier on `email` or
// `manual` has no row here at all, and that is correct — an email handoff has
// nothing to authenticate.
// ─────────────────────────────────────────────────────────────────────────────

export const supplierConnections = pgTable(
	"supplier_connections",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		supplierId: uuid("supplier_id")
			.notNull()
			.references(() => suppliers.id, { onDelete: "cascade" }),
		/**
		 * Which adapter serves this connection.
		 *
		 * Deliberately the same vocabulary as `suppliers.handoffMethod` rather than
		 * a second enum, so "shopify" means one thing in this system. Plain `text`
		 * with the set enforced in TypeScript and zod — widening it needs no
		 * migration, exactly as `handoffMethod` documents.
		 */
		provider: text("provider").notNull(),
		/**
		 * The provider's own name for the account, for a human and for a
		 * cross-check — a Shopify shop domain, an API base, a portal login.
		 *
		 * 🔴 Never trusted as identity on an inbound webhook. A provider that sends
		 * its shop domain in a header is sending an unverified string; this column
		 * is what that string is compared AGAINST once a signature has already
		 * proved who it is.
		 */
		externalAccountRef: text("external_account_ref"),
		/**
		 * The encrypted credential blob, `v1.<iv>.<tag>.<ciphertext>`.
		 *
		 * 🔴 Written and read only by `supplier-credentials.ts`, under its own HKDF
		 * domain. Nothing may select this column to display it: the safe read is
		 * `describeSupplierCredentials`, which answers whether a secret is present
		 * and never what it is.
		 */
		credentials: text("credentials"),
		/**
		 * `pending` until something has actually talked to the provider, `active`
		 * once it has, `failed` when it stopped working.
		 *
		 * ⚠️ Not a boolean. "Never tried" and "tried and broken" need different
		 * words on screen, and a business whose supplier orders silently stopped
		 * going out deserves to be told which one it is.
		 */
		status: text("status", { enum: ["pending", "active", "failed"] })
			.notNull()
			.default("pending"),
		/** The last failure, in the provider's own words, for an operator to read. */
		lastError: text("last_error"),
		lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		/** One connection per supplier per provider. Reconnecting updates it. */
		unique("supplier_connections_supplier_provider_unique").on(
			table.workspaceId,
			table.supplierId,
			table.provider,
		),
		/**
		 * ⚠️ One external account may back only one supplier in a workspace.
		 *
		 * Two suppliers pointed at the same Shopify store would each raise orders
		 * into it, and the tracking coming back could not be attributed to either.
		 */
		unique("supplier_connections_account_unique").on(
			table.workspaceId,
			table.externalAccountRef,
		),
		index("supplier_connections_workspace_idx").on(table.workspaceId),
	],
);
