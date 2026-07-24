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
};

function mapQuoteError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (
			/(MISMATCH|ARCHIVED|IMMUTABLE|NOT_EDITABLE|NOT_SENDABLE|EXPIRED|CONCURRENT|REVISION|LINES_MISSING|NOT_CONVERTIBLE|CONVERT|MODULE)/.test(
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
