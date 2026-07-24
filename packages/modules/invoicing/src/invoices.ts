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
import { z } from "zod";
import { canTransition, type InvoiceStatus } from "./status";
import { computeInvoiceTotals, formatInvoiceNumber } from "./totals";

export const invoiceLineItemInputSchema = z.object({
	description: z.string().trim().min(1).max(500),
	quantity: z.number().int().min(1).max(1_000_000),
	unitPriceCents: z.number().int().min(0).max(2_000_000_000),
	position: z.number().int().min(0).max(10_000).optional(),
});

export type InvoiceLineItemInput = z.input<typeof invoiceLineItemInputSchema>;

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

export const createInvoiceInputSchema = z.object({
	clientId: z.string().uuid().nullable().optional(),
	currency: z
		.string()
		.trim()
		.length(3)
		.transform((value) => value.toUpperCase())
		.optional(),
	taxCents: z.number().int().min(0).max(2_000_000_000).optional(),
	notes: z.string().trim().max(10_000).nullable().optional(),
	dueAt: z.date().nullable().optional(),
	numberPrefix: z.string().trim().min(1).max(12).optional(),
	lineItems: z.array(invoiceLineItemInputSchema).min(1).max(100),
});

export type UpdateDraftInvoiceInput = Omit<CreateInvoiceInput, "numberPrefix">;

async function getClientSnapshot(
	tx: InvoiceTransaction,
	workspaceId: string,
	clientId: string | null | undefined,
) {
	if (!clientId) return null;
	const [client] = await tx
		.select({
			workspaceId: clientRecords.workspaceId,
			name: clientRecords.name,
			email: clientRecords.email,
			company: clientRecords.company,
		})
		.from(clientRecords)
		.where(eq(clientRecords.id, clientId))
		.limit(1);
	if (!client) throw new Error("CLIENT_NOT_FOUND");
	if (client.workspaceId !== workspaceId) {
		throw new Error("CLIENT_WORKSPACE_MISMATCH");
	}
	return client;
}

// Create an invoice with its line items. NOT metered — creating an invoice is a
// business outcome, not billable infrastructure (see the manifest). Totals are
// computed server-side from the line items, never trusted from the client.
export async function createInvoiceInTx(
	tx: InvoiceTransaction,
	workspaceId: string,
	input: CreateInvoiceInput,
) {
	const values = createInvoiceInputSchema.parse(input);
	const totals = computeInvoiceTotals(values.lineItems, values.taxCents ?? 0);
	if (!Number.isSafeInteger(totals.totalCents)) {
		throw new Error("INVOICE_TOTAL_OUT_OF_RANGE");
	}
	{
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1);
		if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
		const client = await getClientSnapshot(tx, workspaceId, values.clientId);
		const sequence = await allocateInvoiceSequence(tx, workspaceId);
		const number = formatInvoiceNumber(values.numberPrefix ?? "INV", sequence);
		const [invoice] = await tx
			.insert(invoices)
			.values({
				workspaceId,
				clientId: values.clientId ?? null,
				clientName: client?.name ?? null,
				clientEmail: client?.email ?? null,
				clientCompany: client?.company ?? null,
				number,
				currency: values.currency ?? "USD",
				subtotalCents: totals.subtotalCents,
				taxCents: totals.taxCents,
				totalCents: totals.totalCents,
				notes: values.notes ?? null,
				dueAt: values.dueAt ?? null,
			})
			.returning();

		await tx.insert(invoiceLineItems).values(
			values.lineItems.map((line, i) => ({
				invoiceId: invoice.id,
				description: line.description,
				quantity: line.quantity,
				unitPriceCents: line.unitPriceCents,
				position: line.position ?? i,
			})),
		);

		return invoice;
	}
}

export async function createInvoice(
	workspaceId: string,
	input: CreateInvoiceInput,
) {
	return db.transaction((tx) => createInvoiceInTx(tx, workspaceId, input));
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
		.where(eq(invoices.workspaceId, workspaceId))
		.orderBy(sql`${invoices.createdAt} desc`);
}

/** A single invoice with its line items (or undefined). */
export async function getInvoice(workspaceId: string, id: string) {
	const [invoice] = await db
		.select()
		.from(invoices)
		.where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id)))
		.limit(1);
	if (!invoice) {
		return undefined;
	}
	const lineItems = await db
		.select()
		.from(invoiceLineItems)
		.where(eq(invoiceLineItems.invoiceId, id))
		.orderBy(invoiceLineItems.position);
	return { ...invoice, lineItems };
}

/** Replace a human-authored draft while preserving its immutable invoice number. */
export async function updateDraftInvoiceInTx(
	tx: InvoiceTransaction,
	workspaceId: string,
	id: string,
	input: UpdateDraftInvoiceInput,
) {
	const values = createInvoiceInputSchema
		.omit({ numberPrefix: true })
		.parse(input);
	const totals = computeInvoiceTotals(values.lineItems, values.taxCents ?? 0);
	if (!Number.isSafeInteger(totals.totalCents)) {
		throw new Error("INVOICE_TOTAL_OUT_OF_RANGE");
	}
	{
		const [invoice] = await tx
			.select()
			.from(invoices)
			.where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id)))
			.limit(1)
			.for("update");
		if (!invoice) throw new Error("INVOICE_NOT_FOUND");
		if (invoice.status !== "draft") throw new Error("INVOICE_NOT_EDITABLE");
		const existingLines = await tx
			.select({ sourceModule: invoiceLineItems.sourceModule })
			.from(invoiceLineItems)
			.where(eq(invoiceLineItems.invoiceId, id));
		if (existingLines.some((line) => line.sourceModule !== null)) {
			throw new Error("INVOICE_HAS_MANAGED_LINES");
		}
		const client = await getClientSnapshot(tx, workspaceId, values.clientId);
		await tx
			.delete(invoiceLineItems)
			.where(eq(invoiceLineItems.invoiceId, invoice.id));
		await tx.insert(invoiceLineItems).values(
			values.lineItems.map((line, index) => ({
				invoiceId: invoice.id,
				description: line.description,
				quantity: line.quantity,
				unitPriceCents: line.unitPriceCents,
				position: line.position ?? index,
			})),
		);
		const [updated] = await tx
			.update(invoices)
			.set({
				clientId: values.clientId ?? null,
				clientName: client?.name ?? null,
				clientEmail: client?.email ?? null,
				clientCompany: client?.company ?? null,
				currency: values.currency ?? "USD",
				...totals,
				notes: values.notes ?? null,
				dueAt: values.dueAt ?? null,
				updatedAt: new Date(),
			})
			.where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id)))
			.returning();
		return updated;
	}
}

export async function updateDraftInvoice(
	workspaceId: string,
	id: string,
	input: UpdateDraftInvoiceInput,
) {
	return db.transaction((tx) =>
		updateDraftInvoiceInTx(tx, workspaceId, id, input),
	);
}

/** Move an invoice to a new status, stamping the matching timestamp. */
export async function setInvoiceStatusInTx(
	tx: InvoiceTransaction,
	workspaceId: string,
	id: string,
	status: InvoiceStatus,
	options: { now?: Date } = {},
) {
	{
		const [current] = await tx
			.select({ status: invoices.status })
			.from(invoices)
			.where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("INVOICE_NOT_FOUND");
		if (current.status === status) throw new Error("INVOICE_STATUS_UNCHANGED");
		if (!canTransition(current.status as InvoiceStatus, status)) {
			throw new Error("INVOICE_ILLEGAL_TRANSITION");
		}

		const now = options.now ?? new Date();
		const [invoice] = await tx
			.update(invoices)
			.set({
				status,
				updatedAt: now,
				...(status === "sent" ? { issuedAt: now } : {}),
				...(status === "paid" ? { paidAt: now } : {}),
			})
			.where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id)))
			.returning();
		return invoice;
	}
}

export async function setInvoiceStatus(
	workspaceId: string,
	id: string,
	status: InvoiceStatus,
	options: { now?: Date } = {},
) {
	return db.transaction((tx) =>
		setInvoiceStatusInTx(tx, workspaceId, id, status, options),
	);
}

/** Permanently delete only an ordinary draft; issued financial history is preserved. */
export async function deleteInvoiceInTx(
	tx: InvoiceTransaction,
	workspaceId: string,
	id: string,
) {
	{
		const [invoice] = await tx
			.select({ status: invoices.status })
			.from(invoices)
			.where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id)))
			.limit(1)
			.for("update");
		if (!invoice) return undefined;
		if (invoice.status !== "draft") throw new Error("INVOICE_NOT_DELETABLE");
		const lines = await tx
			.select({ sourceModule: invoiceLineItems.sourceModule })
			.from(invoiceLineItems)
			.where(eq(invoiceLineItems.invoiceId, id));
		if (lines.some((line) => line.sourceModule !== null)) {
			throw new Error("INVOICE_HAS_MANAGED_LINES");
		}
		const [deleted] = await tx
			.delete(invoices)
			.where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id)))
			.returning({ id: invoices.id });
		return deleted;
	}
}

export async function deleteInvoice(workspaceId: string, id: string) {
	return db.transaction((tx) => deleteInvoiceInTx(tx, workspaceId, id));
}
