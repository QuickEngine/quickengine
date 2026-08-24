import { relations } from "drizzle-orm";
import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";
import { purchaseOrders } from "./purchase-orders";
import { quickengineWorkspaces } from "./quickengine";
import { suppliers } from "./suppliers";

/**
 * Paying a supplier what a purchase order says they are owed.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 A dropshipping supplier had to INVOICE for every single order, and somebody
 * had to pay each invoice by hand. That is one manual step per sale, forever, on
 * both sides — and it is the reason a supplier hesitates before agreeing to the
 * arrangement at all.
 *
 * The obligation is already knowable the moment an order is paid: the purchase
 * order snapshots what each supplier charges, per line, at the price agreed when
 * it was raised. Nothing needs to be asked; it needs to be settled.
 *
 * ⚠️ This is a LEDGER, not a queue. Stripe is not the source of truth for what a
 * business owes — money can move while the process that asked for it dies, a
 * webhook can arrive twice, and a transfer can be reversed months later. What is
 * owed, what was sent, and what came back are recorded here and never deleted.
 */

/**
 * Where a supplier's money goes.
 *
 * 🔑 An account IDENTIFIER, never bank details. The supplier completes Stripe's
 * own hosted onboarding and Stripe holds their KYC and bank information — the
 * same posture as a merchant connecting their own card processor. QuickEngine
 * stores what is needed to send money and nothing that could move it elsewhere.
 *
 * ⚠️ Scoped by ENVIRONMENT as well as supplier. A test recipient must never be
 * reachable from live, which is the same rule `payment_accounts` follows and for
 * the same reason: the one mistake nobody notices until real money has moved.
 */
export const supplierPaymentAccounts = pgTable(
	"supplier_payment_accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		supplierId: uuid("supplier_id")
			.notNull()
			.references(() => suppliers.id, { onDelete: "cascade" }),

		provider: text("provider", { enum: ["stripe"] })
			.notNull()
			.default("stripe"),

		/** The provider's id for the recipient. Never a secret. */
		externalAccountId: text("external_account_id").notNull(),

		environment: text("environment", { enum: ["test", "live"] })
			.notNull()
			.default("live"),

		/**
		 * Whether the supplier can actually RECEIVE money yet.
		 *
		 * 🔴 Separate from `status`. An account can exist, look connected, and
		 * still refuse a transfer because onboarding is unfinished — so the thing
		 * worth checking before sending is this, not whether a row is present.
		 */
		transfersEnabled: text("transfers_enabled", {
			enum: ["yes", "no", "unknown"],
		})
			.notNull()
			.default("unknown"),

		status: text("status", {
			enum: ["pending", "active", "restricted", "disconnected"],
		})
			.notNull()
			.default("pending"),

		/** What the provider says is still outstanding, for showing the supplier. */
		requirements: text("requirements"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("supplier_payment_accounts_workspace_idx").on(table.workspaceId),
		/**
		 * One account per supplier per provider per mode.
		 *
		 * ⚠️ `environment` is part of the key deliberately: the same supplier is
		 * onboarded twice, once for rehearsal and once for real, and the two must
		 * never be able to stand in for each other.
		 */
		unique("supplier_payment_accounts_unique").on(
			table.supplierId,
			table.provider,
			table.environment,
		),
	],
);

/**
 * One supplier obligation, and what happened to it.
 *
 * 🔴 Keyed on the PURCHASE ORDER, not the customer order. An order with lines
 * from two suppliers raises two purchase orders and owes two different people
 * two different amounts — settling "the order" would be meaningless.
 */
export const supplierPayments = pgTable(
	"supplier_payments",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		supplierId: uuid("supplier_id")
			.notNull()
			.references(() => suppliers.id, { onDelete: "cascade" }),

		purchaseOrderId: uuid("purchase_order_id")
			.notNull()
			.references(() => purchaseOrders.id, { onDelete: "cascade" }),

		/** Kept alongside the PO so a settlement can be traced to the sale that caused it. */
		orderId: uuid("order_id").references(() => orders.id, {
			onDelete: "set null",
		}),

		/**
		 * 🔴 What the PURCHASE ORDER says, never what the customer paid.
		 *
		 * The supplier's price is a business agreement, frozen when the order was
		 * raised. Deriving it from retail would mean a shop's own margin changed
		 * what its supplier was owed, and re-reading today's SKU cost would mean a
		 * price change reached backwards into orders already placed.
		 *
		 * ⚠️ Provider fees are NOT deducted. A supplier agreed to a number; who
		 * pays the cost of moving it is a separate question, and answering it by
		 * quietly shaving the supplier's amount is how a partnership ends.
		 */
		amountCents: integer("amount_cents").notNull(),
		currency: text("currency").notNull(),

		environment: text("environment", { enum: ["test", "live"] })
			.notNull()
			.default("live"),

		/**
		 * Where this obligation has got to.
		 *
		 * `calculated` — known and owed, nothing sent
		 * `pending`    — eligible, waiting for its turn
		 * `initiated`  — handed to the provider, outcome unknown
		 * `succeeded`  — the provider confirmed it
		 * `failed`     — refused; safe to retry
		 * `reversed`   — sent, then pulled back after a refund or dispute
		 * `cancelled`  — never owed after all, because the order did not stand
		 *
		 * ⚠️ `initiated` is the state that matters. A process can die between
		 * asking a provider to move money and recording that it did, so a row that
		 * sits in `initiated` is not a bug — it is the reason reconciliation
		 * exists, and it must never be retried blindly.
		 */
		status: text("status", {
			enum: [
				"calculated",
				"pending",
				"initiated",
				"succeeded",
				"failed",
				"reversed",
				"cancelled",
				/**
				 * 🔴 Held: the amount collected and the amount owed disagree.
				 *
				 * Never settles automatically. A person decides, because both
				 * automatic answers are wrong in a way the supplier notices.
				 */
				"discrepancy",
			],
		})
			.notNull()
			.default("calculated"),

		provider: text("provider", { enum: ["stripe"] })
			.notNull()
			.default("stripe"),

		/** The provider's id for the movement, once it has one. */
		externalTransferId: text("external_transfer_id"),

		/**
		 * 🔴 Sent to the provider so a retry cannot pay twice.
		 *
		 * Generated and STORED before the call, not after. A key invented at call
		 * time is no protection at all: the crash this defends against happens
		 * between the provider succeeding and this row being written, and a retry
		 * that makes a fresh key asks the provider for a second, different
		 * payment.
		 */
		idempotencyKey: text("idempotency_key").notNull(),

		/**
		 * What the application fee was set to at checkout, when it differs from
		 * what the purchase order later snapshotted.
		 *
		 * 🔴 Null in the normal case, where they agree. A value here means somebody
		 * changed a supplier's cost in the seconds between the customer paying and
		 * the purchase order being raised — so the platform is holding one amount
		 * and the agreement says another.
		 *
		 * ⚠️ A discrepancy BLOCKS automatic settlement. Paying the snapshot when the
		 * platform holds less would overdraw; paying what is held when the
		 * agreement says otherwise would underpay a supplier who never agreed to
		 * it. Neither is a decision software should make quietly.
		 */
		checkoutAmountCents: integer("checkout_amount_cents"),

		failureCode: text("failure_code"),
		failureMessage: text("failure_message"),

		/** How much has been pulled back, for a partial refund. */
		reversedCents: integer("reversed_cents").notNull().default(0),
		reversalReason: text("reversal_reason"),

		initiatedAt: timestamp("initiated_at", { withTimezone: true }),
		succeededAt: timestamp("succeeded_at", { withTimezone: true }),
		reversedAt: timestamp("reversed_at", { withTimezone: true }),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("supplier_payments_workspace_idx").on(table.workspaceId),
		index("supplier_payments_supplier_idx").on(table.supplierId),
		index("supplier_payments_status_idx").on(table.workspaceId, table.status),
		index("supplier_payments_order_idx").on(table.orderId),

		/**
		 * 🔴 ONE settlement per purchase order. The database refuses a second.
		 *
		 * Every other guard — the eligibility check, the worker's claim, the
		 * provider's idempotency key — can be defeated by two workers racing. This
		 * one cannot, and paying a supplier twice is the failure with no
		 * automatic remedy: the money has left, and getting it back is a
		 * conversation rather than an API call.
		 */
		unique("supplier_payments_purchase_order_unique").on(table.purchaseOrderId),

		/** A provider id, once known, belongs to exactly one row. */
		unique("supplier_payments_transfer_unique").on(table.externalTransferId),
		unique("supplier_payments_idempotency_unique").on(table.idempotencyKey),
	],
);

/**
 * What happened, in order, and who caused it.
 *
 * ⚠️ Append only. A ledger row shows where an obligation ENDED UP; this shows
 * how it got there — which is what a dispute, a reconciliation or an angry
 * supplier actually needs. Money movement that cannot be explained after the
 * fact is money movement nobody should trust.
 */
export const supplierPaymentEvents = pgTable(
	"supplier_payment_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),

		supplierPaymentId: uuid("supplier_payment_id")
			.notNull()
			.references(() => supplierPayments.id, { onDelete: "cascade" }),

		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),

		/** `calculated`, `initiated`, `succeeded`, `failed`, `reversed`, … */
		kind: text("kind").notNull(),

		/** Who or what caused it — a user id, or a worker's name. */
		actor: text("actor"),

		/** The provider's own payload, for answering questions later. */
		detail: text("detail"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("supplier_payment_events_payment_idx").on(table.supplierPaymentId),
		index("supplier_payment_events_workspace_idx").on(table.workspaceId),
	],
);

export const supplierPaymentsRelations = relations(
	supplierPayments,
	({ one, many }) => ({
		supplier: one(suppliers, {
			fields: [supplierPayments.supplierId],
			references: [suppliers.id],
		}),
		purchaseOrder: one(purchaseOrders, {
			fields: [supplierPayments.purchaseOrderId],
			references: [purchaseOrders.id],
		}),
		events: many(supplierPaymentEvents),
	}),
);

export const supplierPaymentEventsRelations = relations(
	supplierPaymentEvents,
	({ one }) => ({
		payment: one(supplierPayments, {
			fields: [supplierPaymentEvents.supplierPaymentId],
			references: [supplierPayments.id],
		}),
	}),
);

/** Amount still owed on an obligation after any reversal. */
export const outstandingCents = (row: {
	amountCents: number;
	reversedCents: number;
}) => Math.max(0, row.amountCents - row.reversedCents);

export type SupplierPaymentStatus =
	(typeof supplierPayments.$inferSelect)["status"];
