import { DomainError } from "@quickengine/api-contracts/errors";
import type {
	MutationExecutionContext,
	MutationResult,
	MutationUnitOfWork,
} from "@quickengine/api-contracts/mutations";
import type { DatabaseTransaction, SortMap } from "@quickengine/db";
import {
	afterCursor,
	and,
	asc,
	db,
	decodeCursor,
	eq,
	invoiceLineItems,
	invoices,
	mutationUnitOfWork,
	pageOrder,
	resolveSort,
	toPage,
} from "@quickengine/db";
import { z } from "zod";
import {
	type CreateInvoiceInput,
	createInvoiceInTx,
	deleteInvoiceInTx,
	setInvoiceStatusInTx,
	type UpdateDraftInvoiceInput,
	updateDraftInvoiceInTx,
} from "./invoices";
import { INVOICE_STATUSES, type InvoiceStatus } from "./status";

export type InvoiceMutationUnitOfWork = MutationUnitOfWork<DatabaseTransaction>;

/**
 * What an operator would order this list by.
 *
 * An allowlist, never a column name from the request: an arbitrary column
 * would let a caller sort by fields the DTO never exposes and read their
 * values off the ordering.
 */
const INVOICE_SORTS = {
	number: invoices.number,
	status: invoices.status,
	totalCents: invoices.totalCents,
	dueAt: invoices.dueAt,
	issuedAt: invoices.issuedAt,
	createdAt: invoices.createdAt,
	updatedAt: invoices.updatedAt,
} as const satisfies SortMap;

export const invoiceListQuerySchema = z.object({
	// Opaque now: it encodes (sortValue, id), so it is no longer a bare uuid.
	cursor: z.string().trim().min(1).optional(),
	direction: z.enum(["asc", "desc"]).default("desc"),
	sort: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	status: z.enum(INVOICE_STATUSES).optional(),
	/**
	 * Restrict to one client's own records.
	 *
	 * Exists for the customer surface, where a signed-in person may only see
	 * their own. Optional because the operator list is legitimately unfiltered;
	 * `customerScope` is the single place that supplies it.
	 */
	clientId: z.uuid().optional(),
});

const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	CLIENT_NOT_FOUND: "The client on this invoice was not found.",
	INVOICE_NOT_FOUND: "The invoice was not found.",
	INVOICE_NOT_EDITABLE: "Only a draft invoice can be edited.",
	INVOICE_HAS_MANAGED_LINES:
		"This invoice has lines owned by another module and can't be edited here.",
	INVOICE_STATUS_UNCHANGED: "The invoice is already in that status.",
	INVOICE_ILLEGAL_TRANSITION: "That invoice status change isn't allowed.",
	INVOICE_NOT_DELETABLE: "Only a draft invoice can be deleted.",
	INVOICE_TOTAL_OUT_OF_RANGE: "The invoice total is too large.",
	CLIENT_WORKSPACE_MISMATCH: "That client belongs to another workspace.",
	INVOICE_LINES_REQUIRED: "An invoice needs at least one line item.",
	INVOICE_SOURCE_LINES_MISMATCH:
		"The lines from the source record no longer match this invoice.",
};

function mapInvoiceError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		// A bad reference or a missing line is the caller's input, not a state conflict.
		if (/(MISMATCH|LINES_REQUIRED)/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		if (
			/(NOT_EDITABLE|MANAGED_LINES|UNCHANGED|ILLEGAL_TRANSITION|NOT_DELETABLE|OUT_OF_RANGE)/.test(
				error.message,
			)
		) {
			throw new DomainError("CONFLICT", message);
		}
	}
	throw error;
}

function serializeDates<T extends Record<string, unknown>>(
	row: T,
): { [K in keyof T]: T[K] extends Date ? string : T[K] } {
	return Object.fromEntries(
		Object.entries(row).map(([key, value]) => [
			key,
			value instanceof Date ? value.toISOString() : value,
		]),
	) as { [K in keyof T]: T[K] extends Date ? string : T[K] };
}

const serializeInvoice = (row: typeof invoices.$inferSelect) =>
	serializeDates(row);
const serializeLine = (row: typeof invoiceLineItems.$inferSelect) =>
	serializeDates(row);

export type InvoiceDto = ReturnType<typeof serializeInvoice>;

export async function listInvoicesPage(
	workspaceId: string,
	query: {
		cursor?: string;
		direction?: string;
		limit?: number | string;
		sort?: string;
		status?: string;
	},
) {
	const page = invoiceListQuerySchema.parse(query);
	// Newest first by default: a list ordered by id is effectively random
	// to the person reading it.
	const sort = resolveSort(INVOICE_SORTS, page.sort, "createdAt");
	const where = and(
		eq(invoices.workspaceId, workspaceId),
		afterCursor(
			sort.column,
			invoices.id,
			decodeCursor(page.cursor),
			page.direction,
		),
		page.status ? eq(invoices.status, page.status) : undefined,
		page.clientId ? eq(invoices.clientId, page.clientId) : undefined,
	);
	const rows = await db
		.select()
		.from(invoices)
		.where(where)
		.orderBy(...pageOrder(sort.column, invoices.id, page.direction))
		.limit(page.limit + 1);
	const paged = toPage(rows, page.limit, sort.key, "id");
	return { items: paged.items.map(serializeInvoice), page: paged.page };
}

export async function getInvoiceDto(workspaceId: string, id: string) {
	const [invoice] = await db
		.select()
		.from(invoices)
		.where(and(eq(invoices.workspaceId, workspaceId), eq(invoices.id, id)))
		.limit(1);
	if (!invoice) return null;
	const lineItems = await db
		.select()
		.from(invoiceLineItems)
		.where(eq(invoiceLineItems.invoiceId, id))
		.orderBy(asc(invoiceLineItems.position));
	return {
		...serializeInvoice(invoice),
		lineItems: lineItems.map(serializeLine),
	};
}

export function createInvoiceCommand(
	context: MutationExecutionContext,
	input: CreateInvoiceInput,
	uow: InvoiceMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<InvoiceDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createInvoiceInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			await transaction.audit({
				action: "invoice.created",
				resourceId: row.id,
				resourceType: "invoice",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "invoice",
				eventName: "invoice.created",
				payload: { invoiceId: row.id },
				version: 1,
			});
			return { result: serializeInvoice(row), status: 201 };
		})
		.catch(mapInvoiceError);
}

export function updateDraftInvoiceCommand(
	context: MutationExecutionContext,
	id: string,
	input: UpdateDraftInvoiceInput,
	uow: InvoiceMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<InvoiceDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateDraftInvoiceInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "invoice.updated",
				resourceId: row.id,
				resourceType: "invoice",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "invoice",
				eventName: "invoice.updated",
				payload: { invoiceId: row.id },
				version: 1,
			});
			return { result: serializeInvoice(row), status: 200 };
		})
		.catch(mapInvoiceError);
}

export function setInvoiceStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: InvoiceStatus,
	uow: InvoiceMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<InvoiceDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setInvoiceStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				status,
			);
			await transaction.audit({
				action: "invoice.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "invoice",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "invoice",
				eventName: "invoice.status-changed",
				payload: { invoiceId: row.id, status },
				version: 1,
			});
			return { result: serializeInvoice(row), status: 200 };
		})
		.catch(mapInvoiceError);
}

export function deleteInvoiceCommand(
	context: MutationExecutionContext,
	id: string,
	uow: InvoiceMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteInvoiceInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			if (!row)
				throw new DomainError("NOT_FOUND", "The invoice was not found.");
			await transaction.audit({
				action: "invoice.deleted",
				resourceId: row.id,
				resourceType: "invoice",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "invoice",
				eventName: "invoice.deleted",
				payload: { invoiceId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapInvoiceError);
}
