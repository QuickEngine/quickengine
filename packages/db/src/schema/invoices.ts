import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { clientRecords } from "./client-records";
import { quickengineWorkspaces } from "./quickengine";

// Invoicing module — bills a workspace's clients. Composes on the Client Records
// module: an invoice points at a client record (the first cross-module reference,
// declared as a `dependsOn` in the manifest). The module owns these tables.
//
// Money is stored as integer **cents**, never floats — currency math on floats
// silently loses precision. Display formatting divides by 100 at the edge.
export const invoices = pgTable(
	"invoices",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		workspaceId: uuid("workspace_id")
			.notNull()
			.references(() => quickengineWorkspaces.id, { onDelete: "cascade" }),
		// Which client this is billed to. `set null` (not cascade): deleting a client
		// must not silently delete their invoice history — the invoice stays, orphaned.
		clientId: uuid("client_id").references(() => clientRecords.id, {
			onDelete: "set null",
		}),
		// Human-facing invoice number, unique per workspace (INV-0001…). Assigned by
		// the module, not the DB default, so workspaces get a clean per-workspace run.
		number: text("number").notNull(),
		status: text("status", {
			enum: ["draft", "sent", "paid", "void"],
		})
			.notNull()
			.default("draft"),
		currency: text("currency").notNull().default("USD"),
		subtotalCents: integer("subtotal_cents").notNull().default(0),
		taxCents: integer("tax_cents").notNull().default(0),
		totalCents: integer("total_cents").notNull().default(0),
		notes: text("notes"),
		issuedAt: timestamp("issued_at", { withTimezone: true }),
		dueAt: timestamp("due_at", { withTimezone: true }),
		paidAt: timestamp("paid_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("invoices_workspace_idx").on(table.workspaceId),
		index("invoices_client_idx").on(table.clientId),
	],
);

// An invoice has many line items. Split out (not a jsonb blob) so line-level
// reporting — top products, revenue by item — is a plain query later.
export const invoiceLineItems = pgTable(
	"invoice_line_items",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		invoiceId: uuid("invoice_id")
			.notNull()
			.references(() => invoices.id, { onDelete: "cascade" }),
		description: text("description").notNull(),
		quantity: integer("quantity").notNull().default(1),
		unitPriceCents: integer("unit_price_cents").notNull().default(0),
		// Preserves the order lines were entered in.
		position: integer("position").notNull().default(0),
	},
	(table) => [index("invoice_line_items_invoice_idx").on(table.invoiceId)],
);
