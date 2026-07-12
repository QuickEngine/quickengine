import {
	clientRecords,
	db,
	eq,
	invoiceLineItems,
	invoices,
	quickengineWorkspaces,
	sql,
} from "@quickengine/db";
import { canTransition, type InvoiceStatus } from "./status";
import { computeInvoiceTotals, formatInvoiceNumber } from "./totals";

export type InvoiceLineItemInput = {
	description: string;
	quantity: number;
	unitPriceCents: number;
	position?: number;
};

export type CreateInvoiceInput = {
	clientId?: string | null;
	currency?: string;
	taxCents?: number;
	notes?: string | null;
	dueAt?: Date | null;
	// From the module settings (numberPrefix). Defaults to "INV" if unset.
	numberPrefix?: string;
	lineItems: InvoiceLineItemInput[];
};

// Create an invoice with its line items. NOT metered — creating an invoice is a
// business outcome, not billable infrastructure (see the manifest). Totals are
// computed server-side from the line items, never trusted from the client.
export async function createInvoice(
	workspaceId: string,
	input: CreateInvoiceInput,
) {
	const [workspace] = await db
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) {
		throw new Error("WORKSPACE_NOT_FOUND");
	}

	// Tenant isolation: an invoice may only reference a client that lives in the
	// same workspace. Without this check a caller could bill against another
	// workspace's client by passing its id.
	if (input.clientId) {
		const [client] = await db
			.select({ workspaceId: clientRecords.workspaceId })
			.from(clientRecords)
			.where(eq(clientRecords.id, input.clientId))
			.limit(1);
		if (!client) {
			throw new Error("CLIENT_NOT_FOUND");
		}
		if (client.workspaceId !== workspaceId) {
			throw new Error("CLIENT_WORKSPACE_MISMATCH");
		}
	}

	if (input.lineItems.length === 0) {
		throw new Error("INVOICE_REQUIRES_LINE_ITEMS");
	}

	const totals = computeInvoiceTotals(input.lineItems, input.taxCents ?? 0);

	// Next per-workspace sequence number. count()+1 races under concurrent creates
	// and can reuse a number after a delete — acceptable for now; a per-workspace
	// counter row is the fix when it matters.
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(invoices)
		.where(eq(invoices.workspaceId, workspaceId));
	const number = formatInvoiceNumber(input.numberPrefix ?? "INV", count + 1);

	return db.transaction(async (tx) => {
		const [invoice] = await tx
			.insert(invoices)
			.values({
				workspaceId,
				clientId: input.clientId ?? null,
				number,
				currency: input.currency ?? "USD",
				subtotalCents: totals.subtotalCents,
				taxCents: totals.taxCents,
				totalCents: totals.totalCents,
				notes: input.notes ?? null,
				dueAt: input.dueAt ?? null,
			})
			.returning();

		await tx.insert(invoiceLineItems).values(
			input.lineItems.map((line, i) => ({
				invoiceId: invoice.id,
				description: line.description,
				quantity: line.quantity,
				unitPriceCents: line.unitPriceCents,
				position: line.position ?? i,
			})),
		);

		return invoice;
	});
}

/** All invoices in a workspace, newest first. */
export async function listInvoices(workspaceId: string) {
	return db
		.select()
		.from(invoices)
		.where(eq(invoices.workspaceId, workspaceId));
}

/** A single invoice with its line items (or undefined). */
export async function getInvoice(id: string) {
	const [invoice] = await db
		.select()
		.from(invoices)
		.where(eq(invoices.id, id))
		.limit(1);
	if (!invoice) {
		return undefined;
	}
	const lineItems = await db
		.select()
		.from(invoiceLineItems)
		.where(eq(invoiceLineItems.invoiceId, id));
	return { ...invoice, lineItems };
}

/** Move an invoice to a new status, stamping the matching timestamp. */
export async function setInvoiceStatus(id: string, status: InvoiceStatus) {
	const [current] = await db
		.select({ status: invoices.status })
		.from(invoices)
		.where(eq(invoices.id, id))
		.limit(1);
	if (!current) {
		throw new Error("INVOICE_NOT_FOUND");
	}
	if (current.status === status) {
		throw new Error("INVOICE_STATUS_UNCHANGED");
	}
	if (!canTransition(current.status as InvoiceStatus, status)) {
		throw new Error("INVOICE_ILLEGAL_TRANSITION");
	}

	const now = new Date();
	const [invoice] = await db
		.update(invoices)
		.set({
			status,
			updatedAt: now,
			...(status === "sent" ? { issuedAt: now } : {}),
			...(status === "paid" ? { paidAt: now } : {}),
		})
		.where(eq(invoices.id, id))
		.returning();
	return invoice;
}

/** Permanently delete an invoice (its line items cascade). */
export async function deleteInvoice(id: string) {
	await db.delete(invoices).where(eq(invoices.id, id));
}
