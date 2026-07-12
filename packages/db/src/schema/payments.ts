import {
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
import { quickengineWorkspaces } from "./quickengine";

// Payments module — collecting money from a workspace's clients via Stripe Connect.
// This is NOT the QuickEngine house-billing (that charges users for their plan). Here
// each workspace connects its OWN Stripe account and money flows to THEM; QuickEngine
// only takes an optional, plan-set application fee (default 0 — you don't pay us to
// receive your own money). The module owns these tables.

// The workspace's connected Stripe account. One per workspace.
export const paymentAccounts = pgTable(
	"payment_accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		provider: text("provider").notNull().default("stripe"),
		// Stripe Connect account id (acct_…). Null until onboarding starts.
		stripeAccountId: text("stripe_account_id"),
		status: text("status", {
			enum: ["pending", "active", "restricted", "disabled"],
		})
			.notNull()
			.default("pending"),
		// Mirrors Stripe's account capabilities — can it take charges / receive payouts.
		chargesEnabled: boolean("charges_enabled").notNull().default(false),
		payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("payment_accounts_workspace_idx").on(table.workspaceId),
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
		invoiceId: uuid("invoice_id").references(() => invoices.id, {
			onDelete: "set null",
		}),
		clientId: uuid("client_id").references(() => clientRecords.id, {
			onDelete: "set null",
		}),
		amountCents: integer("amount_cents").notNull(),
		// QuickEngine's optional platform share of this payment, in cents (default 0).
		applicationFeeCents: integer("application_fee_cents").notNull().default(0),
		currency: text("currency").notNull().default("USD"),
		status: text("status", {
			enum: ["pending", "processing", "succeeded", "failed", "refunded"],
		})
			.notNull()
			.default("pending"),
		provider: text("provider").notNull().default("stripe"),
		stripePaymentIntentId: text("stripe_payment_intent_id"),
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
	],
);
