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
	mutationUnitOfWork,
	quoteEstimateLineItems,
	quoteEstimates,
} from "@quickengine/db";
import { z } from "zod";
import {
	convertQuoteEstimateToInvoiceInTx,
	convertQuoteEstimateToOrderInTx,
} from "./conversion";
import type { QuoteAcceptanceInput, QuoteEstimateInput } from "./quote";
import {
	acceptQuoteEstimateInTx,
	type CreateQuoteEstimateInput,
	createQuoteEstimateInTx,
	deleteDraftQuoteEstimateInTx,
	reviseQuoteEstimateInTx,
	sendQuoteEstimateInTx,
	setSimpleQuoteStatusInTx,
	updateDraftQuoteEstimateInTx,
} from "./records";
import { QUOTE_ESTIMATE_STATUSES } from "./status";

export type QuoteMutationUnitOfWork = MutationUnitOfWork<DatabaseTransaction>;

export const quoteListQuerySchema = z.object({
	cursor: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	status: z.enum(QUOTE_ESTIMATE_STATUSES).optional(),
});

// The module's transaction bodies throw `Error("CODE")`; translate the known codes into stable
// API errors so the Hono boundary and QuickDash surface both get consistent responses.
const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	CLIENT_NOT_FOUND: "The client on this quote was not found.",
	CLIENT_WORKSPACE_MISMATCH: "That client belongs to another workspace.",
	CATALOG_ITEM_NOT_FOUND: "A catalog item on this quote was not found.",
	CATALOG_ITEM_ARCHIVED: "A catalog item on this quote is archived.",
	CATALOG_ITEM_VARIANT_NOT_FOUND: "A variant on this quote was not found.",
	CATALOG_ITEM_VARIANT_ARCHIVED: "A variant on this quote is archived.",
	QUOTE_ESTIMATE_NOT_FOUND: "The quote was not found.",
	QUOTE_ESTIMATE_NOT_EDITABLE: "Only a draft quote can be edited.",
	QUOTE_ESTIMATE_KIND_IMMUTABLE: "A quote's kind cannot change after creation.",
	QUOTE_ESTIMATE_CONCURRENT_UPDATE: "The quote was changed concurrently.",
	QUOTE_ESTIMATE_NOT_SENDABLE:
		"This quote can't be sent from its current status.",
	QUOTE_ESTIMATE_ALREADY_EXPIRED: "This quote is past its valid-until date.",
	CATALOG_ITEM_WORKSPACE_MISMATCH:
		"A catalog item on this quote belongs to another workspace.",
	CATALOG_ITEM_VARIANT_WORKSPACE_MISMATCH:
		"A variant on this quote belongs to another workspace.",
	CATALOG_ITEM_VARIANT_PARENT_MISMATCH:
		"A variant on this quote doesn't belong to its catalog item.",
	QUOTE_ESTIMATE_EXPIRED: "This quote has expired and can't be changed.",
	QUOTE_ESTIMATE_NOT_EXPIRED: "This quote hasn't expired yet.",
	QUOTE_ESTIMATE_ILLEGAL_TRANSITION: "That quote status change isn't allowed.",
	QUOTE_ESTIMATE_NOT_ACCEPTABLE:
		"This quote can't be accepted from its current status.",
	QUOTE_ESTIMATE_NOT_DELETABLE: "Only a draft quote can be deleted.",
	QUOTE_ESTIMATE_NOT_REVISABLE: "This quote can't be revised from its status.",
	QUOTE_ESTIMATE_NOT_CONVERTIBLE: "Only an accepted quote can be converted.",
	QUOTE_ESTIMATE_LINES_MISSING: "A quote needs at least one line.",
	QUOTE_ESTIMATE_ALREADY_CONVERTED_TO_INVOICE:
		"This quote was already converted into an invoice.",
	QUOTE_ESTIMATE_ALREADY_CONVERTED_TO_ORDER:
		"This quote was already converted into an order.",
	QUOTE_ESTIMATE_REVISION_SOURCE_INVALID:
		"The quote being revised is no longer a valid source.",
	QUOTE_ESTIMATE_REVISION_SOURCE_CHANGED:
		"The quote being revised changed while this revision was in flight. Try again.",
	CONVERTED_INVOICE_NOT_FOUND:
		"The invoice this quote was converted into no longer exists.",
	CONVERTED_ORDER_NOT_FOUND:
		"The order this quote was converted into no longer exists.",
	QUOTE_INVOICE_TOTAL_MISMATCH:
		"The converted invoice total doesn't match the quote. Nothing was changed.",
	QUOTE_ORDER_TOTAL_MISMATCH:
		"The converted order total doesn't match the quote. Nothing was changed.",
	QUOTE_ORDER_QUANTITY_EXCEEDED:
		"A line quantity is too large to convert into an order.",
	QUOTE_ORDER_REQUIRES_WHOLE_QUANTITIES:
		"Orders need whole-unit quantities. Adjust the fractional lines first.",
	QUOTE_ORDER_TAX_UNSUPPORTED:
		"Orders can't carry this quote's tax. Convert it to an invoice instead.",
	QUOTE_QUANTITY_INVALID: "Check the quantity on each quote line.",
	QUOTE_UNIT_PRICE_INVALID: "Check the unit price on each quote line.",
	QUOTE_TAX_INVALID: "Check the tax amount on this quote.",
	QUOTE_LINE_TOTAL_EXCEEDED: "A line total on this quote is too large.",
	QUOTE_TOTAL_EXCEEDED: "The quote total is too large.",
};

function mapQuoteError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		// Values the caller supplied are out of bounds: that's a bad request, not a conflict.
		if (/(_INVALID|_EXCEEDED)$/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		// Everything else is the quote's current state refusing the operation.
		if (
			/(MISMATCH|ARCHIVED|IMMUTABLE|NOT_EDITABLE|NOT_SENDABLE|EXPIRED|CONCURRENT|REVIS|LINES_MISSING|ILLEGAL_TRANSITION|NOT_ACCEPTABLE|NOT_DELETABLE|NOT_CONVERTIBLE|CONVERT|REQUIRES_|UNSUPPORTED|MODULE)/.test(
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

const serializeQuote = (row: typeof quoteEstimates.$inferSelect) =>
	serializeDates(row);
const serializeLine = (row: typeof quoteEstimateLineItems.$inferSelect) =>
	serializeDates(row);

export type QuoteEstimateDto = ReturnType<typeof serializeQuote>;
export type QuoteEstimateLineDto = ReturnType<typeof serializeLine>;

export async function listQuoteEstimatesPage(
	workspaceId: string,
	query: { cursor?: string; limit?: number | string; status?: string },
) {
	const page = quoteListQuerySchema.parse(query);
	const where = and(
		eq(quoteEstimates.workspaceId, workspaceId),
		page.cursor ? gt(quoteEstimates.id, page.cursor) : undefined,
		page.status ? eq(quoteEstimates.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(quoteEstimates)
		.where(where)
		.orderBy(asc(quoteEstimates.id))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeQuote),
		page: {
			hasMore,
			nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
		},
	};
}

export async function getQuoteEstimateDto(workspaceId: string, id: string) {
	const [quote] = await db
		.select()
		.from(quoteEstimates)
		.where(
			and(
				eq(quoteEstimates.workspaceId, workspaceId),
				eq(quoteEstimates.id, id),
			),
		)
		.limit(1);
	if (!quote) return null;
	const lines = await db
		.select()
		.from(quoteEstimateLineItems)
		.where(eq(quoteEstimateLineItems.quoteEstimateId, id))
		.orderBy(asc(quoteEstimateLineItems.position));
	return { ...serializeQuote(quote), lines: lines.map(serializeLine) };
}

export function createQuoteEstimateCommand(
	context: MutationExecutionContext,
	input: CreateQuoteEstimateInput,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<QuoteEstimateDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createQuoteEstimateInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			await transaction.audit({
				action: "quote.created",
				resourceId: row.id,
				resourceType: "quote_estimate",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "quote_estimate",
				eventName: "quote.created",
				payload: { quoteEstimateId: row.id },
				version: 1,
			});
			return { result: serializeQuote(row), status: 201 };
		})
		.catch(mapQuoteError);
}

export function updateDraftQuoteEstimateCommand(
	context: MutationExecutionContext,
	id: string,
	input: QuoteEstimateInput,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<QuoteEstimateDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateDraftQuoteEstimateInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "quote.updated",
				resourceId: row.id,
				resourceType: "quote_estimate",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "quote_estimate",
				eventName: "quote.updated",
				payload: { quoteEstimateId: row.id },
				version: 1,
			});
			return { result: serializeQuote(row), status: 200 };
		})
		.catch(mapQuoteError);
}

export function sendQuoteEstimateCommand(
	context: MutationExecutionContext,
	id: string,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<QuoteEstimateDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await sendQuoteEstimateInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "quote.sent",
				resourceId: row.id,
				resourceType: "quote_estimate",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "quote_estimate",
				eventName: "quote.sent",
				payload: { quoteEstimateId: row.id },
				version: 1,
			});
			return { result: serializeQuote(row), status: 200 };
		})
		.catch(mapQuoteError);
}

export function acceptQuoteEstimateCommand(
	context: MutationExecutionContext,
	id: string,
	input: QuoteAcceptanceInput,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<QuoteEstimateDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await acceptQuoteEstimateInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "quote.accepted",
				resourceId: row.id,
				resourceType: "quote_estimate",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "quote_estimate",
				eventName: "quote.accepted",
				payload: { quoteEstimateId: row.id },
				version: 1,
			});
			return { result: serializeQuote(row), status: 200 };
		})
		.catch(mapQuoteError);
}

export function declineQuoteEstimateCommand(
	context: MutationExecutionContext,
	id: string,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<QuoteEstimateDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setSimpleQuoteStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				"declined",
			);
			await transaction.audit({
				action: "quote.declined",
				resourceId: row.id,
				resourceType: "quote_estimate",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "quote_estimate",
				eventName: "quote.declined",
				payload: { quoteEstimateId: row.id },
				version: 1,
			});
			return { result: serializeQuote(row), status: 200 };
		})
		.catch(mapQuoteError);
}

export function deleteQuoteEstimateCommand(
	context: MutationExecutionContext,
	id: string,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteDraftQuoteEstimateInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "quote.deleted",
				resourceId: row.id,
				resourceType: "quote_estimate",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "quote_estimate",
				eventName: "quote.deleted",
				payload: { quoteEstimateId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapQuoteError);
}

function quoteStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: "expired" | "voided",
	uow: QuoteMutationUnitOfWork,
): Promise<MutationResult<QuoteEstimateDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setSimpleQuoteStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				status,
			);
			const verb = status === "expired" ? "expired" : "voided";
			await transaction.audit({
				action: `quote.${verb}`,
				resourceId: row.id,
				resourceType: "quote_estimate",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "quote_estimate",
				eventName: `quote.${verb}`,
				payload: { quoteEstimateId: row.id },
				version: 1,
			});
			return { result: serializeQuote(row), status: 200 };
		})
		.catch(mapQuoteError);
}

export function expireQuoteEstimateCommand(
	context: MutationExecutionContext,
	id: string,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
) {
	return quoteStatusCommand(context, id, "expired", uow);
}

export function voidQuoteEstimateCommand(
	context: MutationExecutionContext,
	id: string,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
) {
	return quoteStatusCommand(context, id, "voided", uow);
}

export function reviseQuoteEstimateCommand(
	context: MutationExecutionContext,
	id: string,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<QuoteEstimateDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await reviseQuoteEstimateInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "quote.revised",
				metadata: { supersedesId: id },
				resourceId: row.id,
				resourceType: "quote_estimate",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "quote_estimate",
				eventName: "quote.revised",
				payload: { quoteEstimateId: row.id, supersedesId: id },
				version: 1,
			});
			return { result: serializeQuote(row), status: 201 };
		})
		.catch(mapQuoteError);
}

export function convertQuoteEstimateToInvoiceCommand(
	context: MutationExecutionContext,
	id: string,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
) {
	return uow
		.execute(context, async (transaction) => {
			const invoice = await convertQuoteEstimateToInvoiceInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "quote.converted",
				metadata: { invoiceId: invoice.id, target: "invoice" },
				resourceId: id,
				resourceType: "quote_estimate",
			});
			await transaction.outbox({
				aggregateId: id,
				aggregateType: "quote_estimate",
				eventName: "quote.converted",
				payload: {
					invoiceId: invoice.id,
					quoteEstimateId: id,
					target: "invoice",
				},
				version: 1,
			});
			return { result: serializeDates(invoice), status: 201 };
		})
		.catch(mapQuoteError);
}

export function convertQuoteEstimateToOrderCommand(
	context: MutationExecutionContext,
	id: string,
	uow: QuoteMutationUnitOfWork = mutationUnitOfWork,
) {
	return uow
		.execute(context, async (transaction) => {
			const order = await convertQuoteEstimateToOrderInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "quote.converted",
				metadata: { orderId: order.id, target: "order" },
				resourceId: id,
				resourceType: "quote_estimate",
			});
			await transaction.outbox({
				aggregateId: id,
				aggregateType: "quote_estimate",
				eventName: "quote.converted",
				payload: { orderId: order.id, quoteEstimateId: id, target: "order" },
				version: 1,
			});
			return { result: serializeDates(order), status: 201 };
		})
		.catch(mapQuoteError);
}
