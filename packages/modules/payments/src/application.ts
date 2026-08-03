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
	mutationUnitOfWork,
	pageOrder,
	paymentRefunds,
	payments,
	resolveSort,
	toPage,
} from "@quickengine/db";
import { z } from "zod";
import {
	type RecordPaymentInput,
	type RefundPaymentInput,
	recordPaymentInTx,
	refundPaymentInTx,
	setPaymentStatusInTx,
} from "./payments";
import { PAYMENT_STATUSES, type PaymentStatus } from "./status";

export type PaymentMutationUnitOfWork = MutationUnitOfWork<DatabaseTransaction>;

/**
 * What an operator would order this list by.
 *
 * An allowlist, never a column name from the request: an arbitrary column
 * would let a caller sort by fields the DTO never exposes and read their
 * values off the ordering.
 */
const PAYMENT_SORTS = {
	reference: payments.reference,
	status: payments.status,
	amountCents: payments.amountCents,
	succeededAt: payments.succeededAt,
	createdAt: payments.createdAt,
} as const satisfies SortMap;

export const paymentListQuerySchema = z.object({
	// Opaque now: it encodes (sortValue, id), so it is no longer a bare uuid.
	cursor: z.string().trim().min(1).optional(),
	direction: z.enum(["asc", "desc"]).default("desc"),
	sort: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	status: z.enum(PAYMENT_STATUSES).optional(),
});

const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	INVOICE_NOT_FOUND: "The invoice on this payment was not found.",
	PAYMENT_NOT_FOUND: "The payment was not found.",
	CLIENT_NOT_FOUND: "The client on this payment was not found.",
	INVOICE_NOT_PAYABLE:
		"That invoice can't take a payment in its current status.",
	ORDER_NOT_FOUND: "The order on this payment was not found.",
	ORDER_NOT_PAYABLE: "That order was cancelled and can't take a payment.",
	PAYMENT_CURRENCY_MISMATCH:
		"The payment currency must match the invoice or order.",
	PAYMENT_EXCEEDS_INVOICE_BALANCE:
		"That payment is more than the invoice's remaining balance.",
	PAYMENT_CLIENT_MISMATCH:
		"The payment client doesn't match the invoice client.",
	PAYMENT_FEE_INVALID: "The application fee can't exceed the payment amount.",
	PAYMENT_STATUS_UNCHANGED: "The payment is already in that status.",
	PAYMENT_ILLEGAL_TRANSITION: "That payment status change isn't allowed.",
	PAYMENT_NOT_REFUNDABLE: "Only a succeeded payment can be refunded.",
	REFUND_EXCEEDS_PAYMENT: "That refund is more than the payment amount.",
};

function mapPaymentError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (
			/(NOT_PAYABLE|MISMATCH|EXCEEDS|FEE_INVALID|UNCHANGED|ILLEGAL_TRANSITION|NOT_REFUNDABLE)/.test(
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

const serializePayment = (row: typeof payments.$inferSelect) =>
	serializeDates(row);
const serializeRefund = (row: typeof paymentRefunds.$inferSelect) =>
	serializeDates(row);

export type PaymentDto = ReturnType<typeof serializePayment>;
export type PaymentRefundDto = ReturnType<typeof serializeRefund>;

export async function listPaymentsPage(
	workspaceId: string,
	query: {
		cursor?: string;
		direction?: string;
		limit?: number | string;
		sort?: string;
		status?: string;
	},
) {
	const page = paymentListQuerySchema.parse(query);
	// Newest first by default: a list ordered by id is effectively random
	// to the person reading it.
	const sort = resolveSort(PAYMENT_SORTS, page.sort, "createdAt");
	const where = and(
		eq(payments.workspaceId, workspaceId),
		afterCursor(
			sort.column,
			payments.id,
			decodeCursor(page.cursor),
			page.direction,
		),
		page.status ? eq(payments.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(payments)
		.where(where)
		.orderBy(...pageOrder(sort.column, payments.id, page.direction))
		.limit(page.limit + 1);
	const paged = toPage(rows, page.limit, sort.key, "id");
	return { items: paged.items.map(serializePayment), page: paged.page };
}

export async function getPaymentDto(workspaceId: string, id: string) {
	const [payment] = await db
		.select()
		.from(payments)
		.where(and(eq(payments.workspaceId, workspaceId), eq(payments.id, id)))
		.limit(1);
	if (!payment) return null;
	const refunds = await db
		.select()
		.from(paymentRefunds)
		.where(
			and(
				eq(paymentRefunds.workspaceId, workspaceId),
				eq(paymentRefunds.paymentId, id),
			),
		)
		.orderBy(asc(paymentRefunds.createdAt));
	return {
		...serializePayment(payment),
		refunds: refunds.map(serializeRefund),
	};
}

export function recordPaymentCommand(
	context: MutationExecutionContext,
	input: RecordPaymentInput,
	uow: PaymentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<PaymentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await recordPaymentInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			await transaction.audit({
				action: "payment.recorded",
				resourceId: row.id,
				resourceType: "payment",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "payment",
				eventName: "payment.recorded",
				payload: { invoiceId: row.invoiceId, paymentId: row.id },
				version: 1,
			});
			return { result: serializePayment(row), status: 201 };
		})
		.catch(mapPaymentError);
}

export function setPaymentStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: PaymentStatus,
	uow: PaymentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<PaymentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setPaymentStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				status,
			);
			await transaction.audit({
				action: "payment.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "payment",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "payment",
				eventName: "payment.status-changed",
				payload: { paymentId: row.id, status },
				version: 1,
			});
			return { result: serializePayment(row), status: 200 };
		})
		.catch(mapPaymentError);
}

export function refundPaymentCommand(
	context: MutationExecutionContext,
	id: string,
	input: RefundPaymentInput,
	uow: PaymentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<PaymentRefundDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await refundPaymentInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "payment.refunded",
				resourceId: id,
				resourceType: "payment",
			});
			await transaction.outbox({
				aggregateId: id,
				aggregateType: "payment",
				eventName: "payment.refunded",
				payload: { paymentId: id, refundId: row.id },
				version: 1,
			});
			return { result: serializeRefund(row), status: 201 };
		})
		.catch(mapPaymentError);
}
