import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { catalogItems } from "./catalog-items";
import { clientAddresses, clientRecords } from "./client-records";
import { orders } from "./orders";
import { quickengineWorkspaces } from "./quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTIONS — a customer paying a business again and again.
//
// ── Not to be confused with the other subscriptions ──────────────────────────
//
// 🔴 `quickengine_subscriptions` is QuickEngine billing its OWN customers for
// QuickDash plans. It is organization-scoped and tied to our Stripe account.
// This is the opposite direction: a coffee roaster charging a shopper every
// month, on the roaster's own provider account, and QuickEngine takes no cut.
//
// The names are unavoidably similar, so the distinction is written here rather
// than left to be rediscovered: **that one is our revenue, this one is the
// customer's.** Hard rule 7 follows directly — this must never be metered per
// active subscription. A business earning more is not QuickEngine costing more.
//
// ── What a subscription is, structurally ─────────────────────────────────────
//
// A standing instruction to place the same order on a schedule. It does not
// hold items, totals or an address of its own beyond the delivery destination:
// every cycle produces a real `order`, priced at that moment, and everything
// downstream — inventory, fulfillment, shipping, refunds — sees an ordinary
// order and needs no knowledge of subscriptions at all.
//
// 🔑 That decoupling is deliberate and is what makes supplier fulfillment
// independent of this work: a subscription's OUTPUT is an order, and an
// adapter's INPUT is an order.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A catalog item that can be bought on a recurring basis.
 *
 * ⚠️ Separate from `catalog_items.pricingModel` rather than a new value in it.
 * A product is very often sellable BOTH ways — a bag of coffee bought once, or
 * every month at a lower price — and collapsing that into one enum forces a
 * business to duplicate the product to offer both.
 */
export const subscriptionPlans = pgTable(
	"subscription_plans",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		/** Shown to the shopper: "Monthly — The Build", "Every 2 weeks". */
		name: text("name").notNull(),
		interval: text("interval", { enum: ["week", "month", "year"] }).notNull(),
		/** Every N intervals. 2 + `week` is fortnightly. */
		intervalCount: integer("interval_count").notNull().default(1),
		/**
		 * 🔴 The recurring price, in integer cents, NOT the catalog price.
		 *
		 * A subscription is usually cheaper than buying once — that discount is
		 * the reason a customer commits. Reading the catalog price at renewal
		 * would also mean a shelf-price change silently repricing every existing
		 * subscriber, which is a thing customers experience as a betrayal.
		 */
		priceCents: integer("price_cents").notNull(),
		currency: text("currency").notNull().default("USD"),
		/** Free days before the first charge. Null means none. */
		trialDays: integer("trial_days"),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [index("subscription_plans_workspace_idx").on(table.workspaceId)],
);

/**
 * What is actually in the box.
 *
 * ── Why this is not just a quantity on the plan ──────────────────────────────
 *
 * 🔴 A plan with one item and a quantity covers "two bags of the same coffee"
 * and completely fails the offering most worth selling: a box holding a LIGHT,
 * a MEDIUM and a DARK. Modelling contents as a single item forces a business to
 * create a fake catalog product called "three coffee box", which then has no
 * stock of its own, cannot be fulfilled from real inventory, and tells the
 * supplier nothing about what to actually pack.
 *
 * 🔑 Contents live on the PLAN, not the subscription: everybody on "The Build"
 * gets the same box, and changing what is in it should change it for every
 * subscriber at once. A rotating plan works by changing these rows between
 * cycles, and because each cycle produces a real order that snapshots its own
 * lines, past orders keep what actually shipped.
 *
 * ⚠️ No price here. The PLAN carries the price of the box; these are contents.
 * Pricing each line separately would let the parts disagree with the whole, and
 * the whole is what the customer agreed to pay.
 */
export const subscriptionPlanItems = pgTable(
	"subscription_plan_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		planId: uuid("plan_id")
			.notNull()
			.references(() => subscriptionPlans.id, { onDelete: "cascade" }),
		catalogItemId: uuid("catalog_item_id")
			.notNull()
			.references(() => catalogItems.id, { onDelete: "restrict" }),
		quantity: integer("quantity").notNull().default(1),
		/** Orders the box's contents on a packing slip and in the console. */
		position: integer("position").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("subscription_plan_items_workspace_idx").on(table.workspaceId),
		index("subscription_plan_items_plan_idx").on(table.planId),
		/**
		 * One row per product per plan. Two bags of the same coffee is
		 * `quantity: 2`, never two rows — otherwise the renewal engine has to
		 * decide whether to merge them and every consumer has to agree.
		 */
		unique("subscription_plan_items_unique").on(
			table.planId,
			table.catalogItemId,
		),
	],
);

/**
 * One customer's standing instruction.
 *
 * ⚠️ `status` is not a lifecycle guess: every value here corresponds to a real
 * thing that happens to real subscriptions, and `past_due` in particular is not
 * `cancelled`. A card that failed once is a customer who still wants the coffee,
 * and treating those as the same thing is how a business loses somebody who
 * would have happily updated their card.
 */
export const subscriptions = pgTable(
	"subscriptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		/**
		 * The client record this subscription belongs to.
		 *
		 * 🔴 This pointed at `workspace_customers` until 2026-08-21, and NOTHING
		 * else agreed with it. Checkout passes the id `resolveCheckoutClient`
		 * returns, which is a `client_records` row, and the renewal hands this
		 * same column straight to `createOrder` as its `clientId`, which is also
		 * a client record. So every insert violated the foreign key, the failure
		 * was swallowed by the best-effort try/catch in `checkout-routes.ts`, and
		 * **no subscription row had ever been created** — the table was empty when
		 * this was found.
		 *
		 * An order belongs to a client record, and a subscription exists to
		 * produce orders. Making the two the same id means the renewal needs no
		 * mapping layer, which is one fewer place for a subscription to charge
		 * somebody it does not belong to.
		 */
		customerId: uuid("customer_id")
			.notNull()
			.references(() => clientRecords.id, { onDelete: "cascade" }),
		/**
		 * A subscription exists BEFORE any of its orders, so it cannot inherit the
		 * mode from one. A rehearsal subscription must never start charging a real
		 * card the day a workspace goes live.
		 */
		environment: text("environment", { enum: ["test", "live"] })
			.notNull()
			.default("live"),
		planId: uuid("plan_id")
			.notNull()
			.references(() => subscriptionPlans.id),
		status: text("status", {
			enum: ["trialing", "active", "past_due", "paused", "cancelled", "ended"],
		})
			.notNull()
			.default("active"),
		quantity: integer("quantity").notNull().default(1),
		/**
		 * 🔴 The provider's own handle for charging this customer again, on the
		 * BUSINESS's provider account.
		 *
		 * Never a card number, and never anything that could reconstruct one. It
		 * is meaningless outside the account that issued it, which is what makes
		 * storing it acceptable at all.
		 */
		providerCustomerId: text("provider_customer_id"),
		providerPaymentMethodId: text("provider_payment_method_id"),
		/**
		 * Where each cycle's order ships.
		 *
		 * ⚠️ A reference, not a snapshot — a subscriber who moves house expects the
		 * NEXT box at the new address. The order snapshots it at renewal, so past
		 * orders keep the address they actually shipped to.
		 */
		destinationId: uuid("destination_id").references(() => clientAddresses.id, {
			onDelete: "set null",
		}),
		/**
		 * When the next order should be created.
		 *
		 * 🔑 The scheduler's only query is "everything due before now", so this is
		 * indexed and is the single source of truth for timing. Deriving the next
		 * date from the last order would make a missed run silently skip a cycle.
		 */
		nextRenewalAt: timestamp("next_renewal_at", { withTimezone: true }),
		/** Set when somebody asks to stop; the subscription runs until then. */
		cancelAt: timestamp("cancel_at", { withTimezone: true }),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
		pausedUntil: timestamp("paused_until", { withTimezone: true }),
		/**
		 * How many consecutive renewals have failed to charge.
		 *
		 * Drives dunning and resets to zero on any success. Counted rather than
		 * inferred from payment history so the retry policy can change without
		 * reinterpreting the past.
		 */
		failedAttempts: integer("failed_attempts").notNull().default(0),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("subscriptions_workspace_idx").on(table.workspaceId),
		index("subscriptions_customer_idx").on(table.customerId),
		index("subscriptions_workspace_status_idx").on(
			table.workspaceId,
			table.status,
		),
		// The scheduler's one query.
		index("subscriptions_due_idx").on(table.nextRenewalAt),
	],
);

/**
 * Which order a given cycle produced.
 *
 * 🔴 The unique key is what makes renewal safe to retry.
 *
 * A scheduler that runs twice, or a job retried after a timeout, must not
 * charge somebody twice for one month. `(subscription_id, period_start)` can
 * only exist once, so the second attempt collides and does nothing rather than
 * producing a second order. This is the same reasoning as idempotency keys on
 * the payment path, applied to time instead of to a request.
 */
export const subscriptionCycles = pgTable(
	"subscription_cycles",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		subscriptionId: uuid("subscription_id")
			.notNull()
			.references(() => subscriptions.id, { onDelete: "cascade" }),
		orderId: uuid("order_id").references(() => orders.id, {
			onDelete: "set null",
		}),
		periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
		periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
		status: text("status", {
			enum: ["pending", "charged", "failed", "skipped"],
		})
			.notNull()
			.default("pending"),
		/** Why a cycle failed, for the operator. Never shown to the customer raw. */
		failureReason: text("failure_reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("subscription_cycles_workspace_idx").on(table.workspaceId),
		index("subscription_cycles_subscription_idx").on(table.subscriptionId),
		unique("subscription_cycles_period_unique").on(
			table.subscriptionId,
			table.periodStart,
		),
	],
);
