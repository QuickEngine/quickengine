import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { clientRecords } from "./client-records";
import { invoices } from "./invoices";
import { payments } from "./payments";
import { quickengineWorkspaces } from "./quickengine";

// Fulfillment is the universal "deliver what was promised" record. Domain modules
// layer their own behavior on top: shipping for commerce, file delivery for digital
// work, or completion for a service. The shared record stays deliberately generic.
export const fulfillments = pgTable(
	"fulfillments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		clientId: uuid("client_id").references(() => clientRecords.id, {
			onDelete: "set null",
		}),
		invoiceId: uuid("invoice_id").references(() => invoices.id, {
			onDelete: "set null",
		}),
		paymentId: uuid("payment_id").references(() => payments.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		kind: text("kind", {
			enum: ["physical", "digital", "service", "other"],
		})
			.notNull()
			.default("other"),
		status: text("status", {
			enum: ["pending", "in_progress", "fulfilled", "cancelled"],
		})
			.notNull()
			.default("pending"),
		// Extension seam for domain modules (carrier/tracking, download ids, etc.).
		details: jsonb("details")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		dueAt: timestamp("due_at", { withTimezone: true }),
		fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("fulfillments_workspace_idx").on(table.workspaceId),
		index("fulfillments_client_idx").on(table.clientId),
		index("fulfillments_invoice_idx").on(table.invoiceId),
		index("fulfillments_payment_idx").on(table.paymentId),
	],
);
