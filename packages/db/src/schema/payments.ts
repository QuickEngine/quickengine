import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { clientRecords } from "./client-records";
import { invoices } from "./invoices";
import { orders } from "./orders";
import { quickengineWorkspaces } from "./quickengine";

// Payments module — collecting money from a workspace's clients through connected providers.
// This is NOT the QuickEngine house-billing (that charges users for their plan). Here
// each workspace connects its OWN merchant account and money flows to THEM; QuickEngine
// only takes an optional, plan-set application fee (default 0 — you don't pay us to
// receive your own money). The module owns these tables.

// A workspace's connected merchant account. One row per provider.
export const paymentAccounts = pgTable(
	"payment_accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		provider: text("provider").notNull().default("stripe"),
		environment: text("environment", { enum: ["test", "live"] })
			.notNull()
			.default("live"),
		// Provider account identity. Null until hosted onboarding starts.
		externalAccountId: text("external_account_id"),
		// Exactly one connected provider supplies checkout by default. Historical
		// payments still resolve their own provider row for refunds.
		isDefault: boolean("is_default").notNull().default(false),
		status: text("status", {
			enum: ["pending", "active", "restricted", "disabled"],
		})
			.notNull()
			.default("pending"),
		// Mirrors Stripe's account capabilities — can it take charges / receive payouts.
		chargesEnabled: boolean("charges_enabled").notNull().default(false),
		payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
		/**
		 * The business's OWN provider credentials, encrypted at rest.
		 *
		 * 🔴 Only for providers with no platform-level connect flow. Stripe leaves
		 * this null: Connect issues an account id and the platform key does the
		 * rest, so QuickEngine never holds a Stripe secret belonging to a
		 * customer. PayPal reserves its hosted onboarding for approved partners,
		 * and QuickEngine deliberately is not one — it takes no cut of what a
		 * business earns, so standing between them and PayPal buys nothing.
		 *
		 * ⚠️ Encrypted with AES-256-GCM under a key derived from the application
		 * secret, and NEVER readable back through the API. A business can replace
		 * these values; it cannot ask us what they are. Storing somebody else's
		 * payment credentials is a real liability and the shape of this column is
		 * the smallest version of it: one provider, one workspace, no history.
		 */
		credentials: text("credentials"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		/**
		 * 🔴 The MODE is part of the identity of a connection.
		 *
		 * This was unique on `(workspace, provider)` alone, which meant a workspace
		 * could hold exactly one Stripe connection for its entire life — stamped
		 * with whichever mode it happened to be connected in.
		 *
		 * That quietly cancelled the sandbox switch. A business could flip the
		 * workspace between sandbox and live freely, but its payment connection
		 * could not follow, and reconnecting threw `PAYMENT_ENVIRONMENT_MISMATCH`
		 * with nothing in the interface offering a way out. Testing the whole
		 * system before taking real money — which is the entire reason sandbox
		 * exists — walked into a dead end at the one step that matters.
		 *
		 * One connection per provider PER MODE. The test connection and the live
		 * connection are different objects, because they are: different keys,
		 * different account, different money.
		 */
		uniqueIndex("payment_accounts_workspace_provider_env_idx").on(
			table.workspaceId,
			table.provider,
			table.environment,
		),
		/**
		 * ⚠️ A default PER MODE, for the same reason. One default for the whole
		 * workspace would mean switching to sandbox either found the live account
		 * or found nothing at all, depending on which was flagged.
		 */
		uniqueIndex("payment_accounts_workspace_default_idx")
			.on(table.workspaceId, table.environment)
			.where(sql`${table.isDefault} = true`),
	],
);

// A single payment attempt/record. Optionally tied to an invoice it settles.
export const payments = pgTable(
	"payments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		// The invoice this pays, if any. `set null`: deleting an invoice must not erase
		// the money record.
		/**
		 * The order this payment settles, when it came from a checkout.
		 *
		 * 🔴 Added 2026-08-03 with the storefront checkout. Payments could only
		 * point at an invoice, so a shopper paying for an order left nothing
		 * connecting the money to the goods — and the settlement webhook had no way
		 * to find which order a provider event had just paid for.
		 *
		 * Nullable: an invoice payment has no order, and a recorded cash payment
		 * may have neither.
		 */
		// ⚠️ `AnyPgColumn` on the callback breaks a circular type inference:
		// `orders` reaches `fulfillments`, which reaches back here, and without an
		// explicit annotation TypeScript gives up and types all three as `any`.
		// Same pattern as `contracts-esign.ts` and `files.ts`.
		orderId: uuid("order_id").references((): AnyPgColumn => orders.id, {
			onDelete: "set null",
		}),
		invoiceId: uuid("invoice_id").references(() => invoices.id, {
			onDelete: "set null",
		}),
		clientId: uuid("client_id").references(() => clientRecords.id, {
			onDelete: "set null",
		}),
		clientName: text("client_name"),
		clientEmail: text("client_email"),
		clientCompany: text("client_company"),
		amountCents: integer("amount_cents").notNull(),
		// QuickEngine's optional platform share of this payment, in cents (default 0).
		applicationFeeCents: integer("application_fee_cents").notNull().default(0),
		currency: text("currency").notNull().default("USD"),
		status: text("status", {
			enum: [
				"pending",
				"processing",
				"succeeded",
				"failed",
				"disputed",
				"refunded",
			],
		})
			.notNull()
			.default("pending"),
		provider: text("provider").notNull().default("stripe"),
		environment: text("environment", { enum: ["test", "live"] })
			.notNull()
			.default("live"),
		paymentMethod: text("payment_method").notNull().default("card"),
		externalPaymentId: text("external_payment_id"),
		stripePaymentIntentId: text("stripe_payment_intent_id"),
		reference: text("reference"),
		notes: text("notes"),
		succeededAt: timestamp("succeeded_at", { withTimezone: true }),
		failedAt: timestamp("failed_at", { withTimezone: true }),
		refundedAt: timestamp("refunded_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("payments_workspace_idx").on(table.workspaceId),
		index("payments_invoice_idx").on(table.invoiceId),
		uniqueIndex("payments_provider_external_unique").on(
			table.provider,
			table.environment,
			table.externalPaymentId,
		),
		// Stripe retries webhooks, and a retry that populated only the payment intent
		// had nothing stopping it creating a second payment row: the index above
		// covers `external_payment_id`, which is nullable, and Postgres does not
		// collide NULLs — so any number of rows with a null external id were allowed.
		// Partial, because the column is null for every non-Stripe payment and those
		// must not collide with each other.
		uniqueIndex("payments_stripe_intent_unique")
			.on(table.workspaceId, table.stripePaymentIntentId)
			.where(sql`${table.stripePaymentIntentId} is not null`),
	],
);

// Refunds are append-only money movements. Keeping them separate preserves partial
// refund history instead of overwriting a payment with one terminal boolean.
export const paymentRefunds = pgTable(
	"payment_refunds",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		paymentId: uuid("payment_id")
			.notNull()
			.references(() => payments.id, { onDelete: "restrict" }),
		amountCents: integer("amount_cents").notNull(),
		provider: text("provider").notNull(),
		environment: text("environment", { enum: ["test", "live"] })
			.notNull()
			.default("live"),
		externalRefundId: text("external_refund_id"),
		reason: text("reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("payment_refunds_workspace_idx").on(table.workspaceId),
		index("payment_refunds_payment_idx").on(table.paymentId),
		uniqueIndex("payment_refunds_provider_external_unique").on(
			table.provider,
			table.environment,
			table.externalRefundId,
		),
	],
);
