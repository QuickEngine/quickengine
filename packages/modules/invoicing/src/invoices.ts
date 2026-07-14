import {
	and,
	clientRecords,
	db,
	eq,
	inArray,
	invoiceLineItems,
	invoiceSequences,
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

export type SourcedInvoiceLineItemInput = InvoiceLineItemInput & {
	sourceModule: string;
	sourceRecordId: string;
};

export type InvoiceTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];

export async function allocateInvoiceSequence(
	tx: InvoiceTransaction,
	workspaceId: string,
	now = new Date(),
) {
	const [counter] = await tx
		.insert(invoiceSequences)
		.values({ workspaceId, lastSequence: 1, updatedAt: now })
		.onConflictDoUpdate({
			target: invoiceSequences.workspaceId,
			set: {
				lastSequence: sql`${invoiceSequences.lastSequence} + 1`,
				updatedAt: now,
			},
		})
		.returning({ sequence: invoiceSequences.lastSequence });
	return counter.sequence;
}

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
	if (input.lineItems.length === 0) {
		throw new Error("INVOICE_REQUIRES_LINE_ITEMS");
	}
	const totals = computeInvoiceTotals(input.lineItems, input.taxCents ?? 0);
	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1);
		if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
		// Tenant isolation: an invoice may only reference a client from this workspace.
		if (input.clientId) {
			const [client] = await tx
				.select({ workspaceId: clientRecords.workspaceId })
				.from(clientRecords)
				.where(eq(clientRecords.id, input.clientId))
				.limit(1);
			if (!client) throw new Error("CLIENT_NOT_FOUND");
			if (client.workspaceId !== workspaceId) {
				throw new Error("CLIENT_WORKSPACE_MISMATCH");
			}
		}
		const sequence = await allocateInvoiceSequence(tx, workspaceId);
		const number = formatInvoiceNumber(input.numberPrefix ?? "INV", sequence);
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

/**
 * Append module-owned lines to a draft invoice and recompute its totals.
 *
 * The caller supplies the transaction so the source module can update its own
 * records in the same commit. Locking the invoice serializes line mutations and
 * the source identity columns make retries safe at the database boundary.
 */
export async function appendDraftInvoiceLineItems(
	tx: InvoiceTransaction,
	workspaceId: string,
	invoiceId: string,
	lineItems: SourcedInvoiceLineItemInput[],
) {
	if (lineItems.length === 0) throw new Error("INVOICE_LINES_REQUIRED");
	const [invoice] = await tx
		.select()
		.from(invoices)
		.where(
			and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, invoiceId)),
		)
		.limit(1)
		.for("update");
	if (!invoice) throw new Error("INVOICE_NOT_FOUND");
	if (invoice.status !== "draft") throw new Error("INVOICE_NOT_EDITABLE");

	const existing = await tx
		.select({
			quantity: invoiceLineItems.quantity,
			unitPriceCents: invoiceLineItems.unitPriceCents,
			position: invoiceLineItems.position,
		})
		.from(invoiceLineItems)
		.where(eq(invoiceLineItems.invoiceId, invoiceId));
	const nextPosition =
		existing.reduce((highest, line) => Math.max(highest, line.position), -1) +
		1;
	await tx.insert(invoiceLineItems).values(
		lineItems.map((line, index) => ({
			invoiceId,
			description: line.description,
			quantity: line.quantity,
			unitPriceCents: line.unitPriceCents,
			sourceModule: line.sourceModule,
			sourceRecordId: line.sourceRecordId,
			position: line.position ?? nextPosition + index,
		})),
	);

	const totals = computeInvoiceTotals(
		[...existing, ...lineItems],
		invoice.taxCents,
	);
	const [updated] = await tx
		.update(invoices)
		.set({ ...totals, updatedAt: new Date() })
		.where(
			and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, invoiceId)),
		)
		.returning();
	return updated;
}

/** Remove source-owned lines from a draft invoice and recompute its totals. */
export async function removeDraftInvoiceLineItemsBySource(
	tx: InvoiceTransaction,
	workspaceId: string,
	invoiceId: string,
	sourceModule: string,
	sourceRecordIds: string[],
) {
	if (sourceRecordIds.length === 0) throw new Error("INVOICE_LINES_REQUIRED");
	const [invoice] = await tx
		.select()
		.from(invoices)
		.where(
			and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, invoiceId)),
		)
		.limit(1)
		.for("update");
	if (!invoice) throw new Error("INVOICE_NOT_FOUND");
	if (invoice.status !== "draft") throw new Error("INVOICE_NOT_EDITABLE");

	const removed = await tx
		.delete(invoiceLineItems)
		.where(
			and(
				eq(invoiceLineItems.invoiceId, invoiceId),
				eq(invoiceLineItems.sourceModule, sourceModule),
				inArray(invoiceLineItems.sourceRecordId, sourceRecordIds),
			),
		)
		.returning({ id: invoiceLineItems.id });
	if (removed.length !== sourceRecordIds.length) {
		throw new Error("INVOICE_SOURCE_LINES_MISMATCH");
	}

	const remaining = await tx
		.select({
			quantity: invoiceLineItems.quantity,
			unitPriceCents: invoiceLineItems.unitPriceCents,
		})
		.from(invoiceLineItems)
		.where(eq(invoiceLineItems.invoiceId, invoiceId));
	const totals = computeInvoiceTotals(remaining, invoice.taxCents);
	const [updated] = await tx
		.update(invoices)
		.set({ ...totals, updatedAt: new Date() })
		.where(
			and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, invoiceId)),
		)
		.returning();
	return updated;
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
