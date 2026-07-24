import { DomainError } from "@quickengine/api-contracts/errors";
import type {
	MutationExecutionContext,
	MutationResult,
	MutationUnitOfWork,
} from "@quickengine/api-contracts/mutations";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	and,
	asc,
	db,
	eq,
	gt,
	invoiceLineItems,
	invoices,
	mutationUnitOfWork,
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

export const invoiceListQuerySchema = z.object({
	cursor: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	status: z.enum(INVOICE_STATUSES).optional(),
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
};

function mapInvoiceError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
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
	query: { cursor?: string; limit?: number | string; status?: string },
) {
	const page = invoiceListQuerySchema.parse(query);
	const where = and(
		eq(invoices.workspaceId, workspaceId),
		page.cursor ? gt(invoices.id, page.cursor) : undefined,
		page.status ? eq(invoices.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(invoices)
		.where(where)
		.orderBy(asc(invoices.id))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeInvoice),
		page: {
			hasMore,
			nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
		},
	};
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
