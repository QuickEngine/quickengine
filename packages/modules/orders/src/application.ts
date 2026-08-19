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
	orderLineItems,
	orders,
	pageOrder,
	resolveSort,
	toPage,
} from "@quickengine/db";
import { z } from "zod";
import { redeemDiscountInTx } from "./discounts";
import type { OrderInput } from "./order";
import {
	type CreateOrderInput,
	createOrderInTx,
	deleteOrderInTx,
	ensureOrderFulfillmentInTx,
	setOrderStatusInTx,
	updateDraftOrderInTx,
} from "./orders";
import { ORDER_STATUSES, type OrderStatus } from "./status";

export type OrderMutationUnitOfWork = MutationUnitOfWork<DatabaseTransaction>;

/**
 * What an operator would order this list by.
 *
 * An allowlist, never a column name from the request — an arbitrary column would
 * let a caller sort by fields the DTO never exposes and read their values off the
 * ordering.
 */
const ORDER_SORTS = {
	number: orders.number,
	placedAt: orders.placedAt,
	status: orders.status,
	totalCents: orders.totalCents,
	createdAt: orders.createdAt,
	updatedAt: orders.updatedAt,
} as const satisfies SortMap;

export const orderListQuerySchema = z.object({
	// Opaque now: it encodes (sortValue, id), so it is no longer a bare uuid.
	cursor: z.string().trim().min(1).optional(),
	direction: z.enum(["asc", "desc"]).default("desc"),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	sort: z.string().trim().min(1).optional(),
	status: z.enum(ORDER_STATUSES).optional(),
	/**
	 * Restrict to one client's own orders.
	 *
	 * Exists for the customer surface, where a signed-in shopper may only see
	 * their own. Optional here because the operator list is legitimately
	 * unfiltered — the customer routes never call this without it, and
	 * `customerScope` is the single place that supplies it.
	 */
	clientId: z.uuid().optional(),
});

const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	DISCOUNT_WINDOW_INVALID: "That discount ends before it starts.",
	DISCOUNT_EXHAUSTED:
		"That discount code was just used up. Remove it and try again.",
	REFERRAL_CODE_GENERATION_FAILED:
		"We couldn't create a referral code just now. Try again.",
	REFERRAL_CODE_TAKEN: "That code is already in use in this workspace.",
	REFERRAL_CODE_NOT_FOUND: "That partner link was not found.",
	SUBSCRIPTION_PLAN_NOT_FOUND: "That subscription is no longer offered.",
	SUBSCRIPTION_PLAN_EMPTY:
		"That subscription has nothing in it, so there is nothing to send.",
	SUBSCRIPTION_NOT_FOUND: "That subscription was not found.",
	// Says what is allowed AND why it is restricted — the constraint is
	// arbitrary-looking until you know the code becomes part of a web address.
	REFERRAL_CODE_INVALID:
		"A partner code becomes part of a web address, so it may use letters, numbers and hyphens only.",
	CLIENT_NOT_FOUND: "The client on this order was not found.",
	CLIENT_WORKSPACE_MISMATCH: "That client belongs to another workspace.",
	CATALOG_ITEM_NOT_FOUND: "A catalog item on this order was not found.",
	CATALOG_ITEM_WORKSPACE_MISMATCH:
		"A catalog item on this order belongs to another workspace.",
	CATALOG_ITEM_VARIANT_NOT_FOUND:
		"A catalog item variant on this order was not found.",
	CATALOG_ITEM_VARIANT_WORKSPACE_MISMATCH:
		"A catalog item variant on this order belongs to another workspace.",
	CATALOG_ITEM_VARIANT_PARENT_MISMATCH:
		"A variant on this order doesn't belong to its catalog item.",
	ORDER_NOT_FOUND: "The order was not found.",
	ORDER_NOT_EDITABLE: "Only a draft order can be edited.",
	ORDER_STATUS_UNCHANGED: "The order is already in that status.",
	ORDER_ILLEGAL_TRANSITION: "That order status change isn't allowed.",
	ORDER_NOT_DELETABLE: "Only a draft order can be deleted.",
	ORDER_CONCURRENT_UPDATE:
		"The order changed while this update was in flight. Try again.",
	ORDER_NOT_READY_FOR_FULFILLMENT:
		"Only a confirmed or processing order can start fulfillment.",
	ORDER_FULFILLMENT_NOT_COMPLETE:
		"The order can't be fulfilled until its fulfillment is complete.",
	ORDER_FULFILLMENT_ALREADY_COMPLETE:
		"The order can't be cancelled after its fulfillment completed.",
	ORDER_FULFILLMENT_LINK_FAILED:
		"The order's fulfillment was created by another request. Try again.",
};

function mapOrderError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (
			/MISMATCH|DISCOUNT_WINDOW_INVALID|REFERRAL_CODE_INVALID/.test(
				error.message,
			)
		) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		if (
			/(NOT_EDITABLE|UNCHANGED|ILLEGAL_TRANSITION|NOT_DELETABLE|CONCURRENT_UPDATE|NOT_READY_FOR_FULFILLMENT|FULFILLMENT_NOT_COMPLETE|FULFILLMENT_ALREADY_COMPLETE|FULFILLMENT_LINK_FAILED|REFERRAL_CODE_GENERATION_FAILED|REFERRAL_CODE_TAKEN|SUBSCRIPTION_PLAN_EMPTY|DISCOUNT_EXHAUSTED)/.test(
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

const serializeOrder = (row: typeof orders.$inferSelect) => serializeDates(row);
const serializeLine = (row: typeof orderLineItems.$inferSelect) =>
	serializeDates(row);

export type OrderDto = ReturnType<typeof serializeOrder>;

export async function listOrdersPage(
	workspaceId: string,
	query: {
		cursor?: string;
		direction?: string;
		limit?: number | string;
		sort?: string;
		status?: string;
	},
) {
	const page = orderListQuerySchema.parse(query);
	// Newest first by default: an operational list ordered by id is effectively
	// random to the person reading it.
	const sort = resolveSort(ORDER_SORTS, page.sort, "createdAt");
	const where = and(
		eq(orders.workspaceId, workspaceId),
		afterCursor(
			sort.column,
			orders.id,
			decodeCursor(page.cursor),
			page.direction,
		),
		page.status ? eq(orders.status, page.status) : undefined,
		page.clientId ? eq(orders.clientId, page.clientId) : undefined,
	);
	const rows = await db
		.select()
		.from(orders)
		.where(where)
		.orderBy(...pageOrder(sort.column, orders.id, page.direction))
		.limit(page.limit + 1);
	const paged = toPage(rows, page.limit, sort.key, "id");
	return { items: paged.items.map(serializeOrder), page: paged.page };
}

export async function getOrderDto(workspaceId: string, id: string) {
	const [order] = await db
		.select()
		.from(orders)
		.where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, id)))
		.limit(1);
	if (!order) return null;
	const lines = await db
		.select()
		.from(orderLineItems)
		.where(eq(orderLineItems.orderId, id))
		.orderBy(asc(orderLineItems.position));
	return {
		...serializeOrder(order),
		lineItems: lines.map(serializeLine),
	};
}

export function createOrderCommand(
	context: MutationExecutionContext,
	input: CreateOrderInput,
	uow: OrderMutationUnitOfWork = mutationUnitOfWork,
	/**
	 * A discount to spend in the SAME transaction that writes the order.
	 *
	 * 🔴 This used to happen after the command returned, because this command
	 * owned its transaction and had no way to accept extra work. The window that
	 * left: an order could exist carrying a discount whose redemption row was
	 * never written, so a code could be used one more time than its cap allowed.
	 *
	 * Both now commit together or neither does. If the cap is claimed by somebody
	 * else between pricing and writing, the order is rolled back and the shopper
	 * is told the code has just been used up — which is the honest answer, and
	 * better than quietly handing out a discount that no longer exists.
	 */
	redemption?: {
		discountId: string;
		clientRecordId: string | null;
		amountCents: number;
	},
): Promise<MutationResult<OrderDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createOrderInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			if (redemption) {
				const spent = await redeemDiscountInTx(transaction.db, {
					workspaceId: context.workspaceId,
					discountId: redemption.discountId,
					clientRecordId: redemption.clientRecordId,
					orderId: row.id,
					amountCents: redemption.amountCents,
				});
				// Throwing rolls the order back with it. The conditional UPDATE inside
				// `redeemDiscountInTx` is what makes this race-safe: two shoppers
				// spending the last use cannot both win it.
				if (!spent) throw new Error("DISCOUNT_EXHAUSTED");
			}
			await transaction.audit({
				action: "order.created",
				resourceId: row.id,
				resourceType: "order",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "order",
				eventName: "order.created",
				payload: { orderId: row.id },
				version: 1,
			});
			return { result: serializeOrder(row), status: 201 };
		})
		.catch(mapOrderError);
}

export function updateDraftOrderCommand(
	context: MutationExecutionContext,
	id: string,
	input: OrderInput,
	uow: OrderMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<OrderDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateDraftOrderInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "order.updated",
				resourceId: row.id,
				resourceType: "order",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "order",
				eventName: "order.updated",
				payload: { orderId: row.id },
				version: 1,
			});
			return { result: serializeOrder(row), status: 200 };
		})
		.catch(mapOrderError);
}

export function setOrderStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: OrderStatus,
	uow: OrderMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<OrderDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setOrderStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				status,
			);
			await transaction.audit({
				action: "order.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "order",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "order",
				eventName: "order.status-changed",
				payload: { orderId: row.id, status },
				version: 1,
			});
			return { result: serializeOrder(row), status: 200 };
		})
		.catch(mapOrderError);
}

export function ensureOrderFulfillmentCommand(
	context: MutationExecutionContext,
	id: string,
	uow: OrderMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ fulfillmentId: string; orderId: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const fulfillmentId = await ensureOrderFulfillmentInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			await transaction.audit({
				action: "order.fulfillment-ensured",
				metadata: { fulfillmentId },
				resourceId: id,
				resourceType: "order",
			});
			await transaction.outbox({
				aggregateId: id,
				aggregateType: "order",
				eventName: "order.fulfillment-ensured",
				payload: { fulfillmentId, orderId: id },
				version: 1,
			});
			return { result: { fulfillmentId, orderId: id }, status: 200 };
		})
		.catch(mapOrderError);
}

export function deleteOrderCommand(
	context: MutationExecutionContext,
	id: string,
	uow: OrderMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteOrderInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			if (!row) throw new DomainError("NOT_FOUND", "The order was not found.");
			await transaction.audit({
				action: "order.deleted",
				resourceId: row.id,
				resourceType: "order",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "order",
				eventName: "order.deleted",
				payload: { orderId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapOrderError);
}
