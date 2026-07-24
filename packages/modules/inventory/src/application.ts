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
	desc,
	eq,
	gt,
	inventoryAdjustments,
	inventoryItems,
	mutationUnitOfWork,
} from "@quickengine/db";
import { z } from "zod";
import {
	INVENTORY_ITEM_STATUSES,
	type InventoryAdjustmentInput,
	type InventoryItemInput,
} from "./inventory";
import {
	applyInventoryAdjustmentInTx,
	createInventoryItemInTx,
	deleteInventoryItemInTx,
	setInventoryItemStatusInTx,
	updateInventoryItemInTx,
} from "./inventory-items";

export type InventoryMutationUnitOfWork =
	MutationUnitOfWork<DatabaseTransaction>;

export const inventoryListQuerySchema = z.object({
	cursor: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	status: z.enum(INVENTORY_ITEM_STATUSES).optional(),
});

const FRIENDLY: Record<string, string> = {
	WORKSPACE_NOT_FOUND: "The workspace was not found.",
	CATALOG_ITEM_NOT_FOUND: "The catalog item being tracked was not found.",
	CATALOG_ITEM_WORKSPACE_MISMATCH:
		"That catalog item belongs to another workspace.",
	CATALOG_ITEM_VARIANT_NOT_FOUND: "The variant being tracked was not found.",
	CATALOG_ITEM_VARIANT_WORKSPACE_MISMATCH:
		"That variant belongs to another workspace.",
	CATALOG_ITEM_VARIANT_PARENT_MISMATCH:
		"That variant doesn't belong to the catalog item being tracked.",
	INVENTORY_ITEM_NOT_FOUND: "The stock record was not found.",
	INVENTORY_UPDATE_EMPTY: "There was nothing to change.",
	INVENTORY_STATUS_UNCHANGED: "The stock record is already in that status.",
	INVENTORY_HAS_RESERVATIONS:
		"This stock record still has reserved units. Release them before archiving.",
	INVENTORY_CONCURRENT_UPDATE:
		"The stock record changed while this update was in flight. Try again.",
	INVENTORY_ITEM_ARCHIVED: "An archived stock record can't be adjusted.",
	INVENTORY_ITEM_MUST_BE_ARCHIVED:
		"Archive the stock record before deleting it.",
	INVENTORY_BALANCE_NOT_ZERO:
		"On-hand and reserved must both be zero before deleting.",
	INVENTORY_HISTORY_EXISTS:
		"This stock record has movement history and can't be deleted. Archive it instead.",
	INVENTORY_RESERVED_BELOW_ZERO:
		"There aren't that many reserved units to release or fulfill.",
	INVENTORY_INSUFFICIENT_AVAILABLE:
		"There isn't enough available stock for that movement.",
};

function mapInventoryError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (/MISMATCH|UPDATE_EMPTY/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		if (
			/(UNCHANGED|HAS_RESERVATIONS|CONCURRENT_UPDATE|ARCHIVED|BALANCE_NOT_ZERO|HISTORY_EXISTS|RESERVED_BELOW_ZERO|INSUFFICIENT_AVAILABLE)/.test(
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

const serializeItem = (row: typeof inventoryItems.$inferSelect) =>
	serializeDates(row);
const serializeAdjustment = (row: typeof inventoryAdjustments.$inferSelect) =>
	serializeDates(row);

export type InventoryItemDto = ReturnType<typeof serializeItem>;
export type InventoryAdjustmentDto = ReturnType<typeof serializeAdjustment>;

export async function listInventoryItemsPage(
	workspaceId: string,
	query: { cursor?: string; limit?: number | string; status?: string },
) {
	const page = inventoryListQuerySchema.parse(query);
	const where = and(
		eq(inventoryItems.workspaceId, workspaceId),
		page.cursor ? gt(inventoryItems.id, page.cursor) : undefined,
		page.status ? eq(inventoryItems.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(inventoryItems)
		.where(where)
		.orderBy(asc(inventoryItems.id))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeItem),
		page: {
			hasMore,
			nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
		},
	};
}

export async function getInventoryItemDto(workspaceId: string, id: string) {
	const [item] = await db
		.select()
		.from(inventoryItems)
		.where(
			and(
				eq(inventoryItems.workspaceId, workspaceId),
				eq(inventoryItems.id, id),
			),
		)
		.limit(1);
	return item ? serializeItem(item) : null;
}

export async function listInventoryAdjustmentsPage(
	workspaceId: string,
	inventoryItemId: string,
	query: { limit?: number | string } = {},
) {
	const limit = z.coerce
		.number()
		.int()
		.min(1)
		.max(100)
		.default(25)
		.parse(query.limit);
	const rows = await db
		.select()
		.from(inventoryAdjustments)
		.where(
			and(
				eq(inventoryAdjustments.workspaceId, workspaceId),
				eq(inventoryAdjustments.inventoryItemId, inventoryItemId),
			),
		)
		.orderBy(
			desc(inventoryAdjustments.createdAt),
			desc(inventoryAdjustments.id),
		)
		.limit(limit);
	return { items: rows.map(serializeAdjustment) };
}

export function createInventoryItemCommand(
	context: MutationExecutionContext,
	input: InventoryItemInput,
	uow: InventoryMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<InventoryItemDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createInventoryItemInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			await transaction.audit({
				action: "inventory-item.created",
				resourceId: row.id,
				resourceType: "inventory-item",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "inventory-item",
				eventName: "inventory-item.created",
				payload: { inventoryItemId: row.id },
				version: 1,
			});
			return { result: serializeItem(row), status: 201 };
		})
		.catch(mapInventoryError);
}

export function updateInventoryItemCommand(
	context: MutationExecutionContext,
	id: string,
	input: { lowStockThreshold?: number; metadata?: Record<string, unknown> },
	uow: InventoryMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<InventoryItemDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateInventoryItemInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "inventory-item.updated",
				resourceId: row.id,
				resourceType: "inventory-item",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "inventory-item",
				eventName: "inventory-item.updated",
				payload: { inventoryItemId: row.id },
				version: 1,
			});
			return { result: serializeItem(row), status: 200 };
		})
		.catch(mapInventoryError);
}

export function setInventoryItemStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: "active" | "archived",
	uow: InventoryMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<InventoryItemDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setInventoryItemStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				status,
			);
			await transaction.audit({
				action: "inventory-item.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "inventory-item",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "inventory-item",
				eventName: "inventory-item.status-changed",
				payload: { inventoryItemId: row.id, status },
				version: 1,
			});
			return { result: serializeItem(row), status: 200 };
		})
		.catch(mapInventoryError);
}

/**
 * Record a stock movement. Two independent replay guards apply and both are wanted:
 * the API idempotency key on `context` makes a retried HTTP call harmless, while the
 * optional `input.idempotencyKey` is a business-level guard so the same real-world
 * event (a delivery, a webhook) can't be counted twice from different callers.
 */
export function applyInventoryAdjustmentCommand(
	context: MutationExecutionContext,
	id: string,
	input: InventoryAdjustmentInput,
	options: { allowNegativeStock?: boolean } = {},
	uow: InventoryMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<InventoryAdjustmentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await applyInventoryAdjustmentInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
				options,
			);
			await transaction.audit({
				action: "inventory-item.adjusted",
				metadata: {
					kind: row.kind,
					resultingOnHand: row.resultingOnHand,
					resultingReserved: row.resultingReserved,
				},
				resourceId: id,
				resourceType: "inventory-item",
			});
			await transaction.outbox({
				aggregateId: id,
				aggregateType: "inventory-item",
				eventName: "inventory-item.adjusted",
				payload: {
					adjustmentId: row.id,
					inventoryItemId: id,
					kind: row.kind,
					resultingOnHand: row.resultingOnHand,
					resultingReserved: row.resultingReserved,
				},
				version: 1,
			});
			return { result: serializeAdjustment(row), status: 201 };
		})
		.catch(mapInventoryError);
}

export function deleteInventoryItemCommand(
	context: MutationExecutionContext,
	id: string,
	uow: InventoryMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteInventoryItemInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			if (!row)
				throw new DomainError("NOT_FOUND", "The stock record was not found.");
			await transaction.audit({
				action: "inventory-item.deleted",
				resourceId: row.id,
				resourceType: "inventory-item",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "inventory-item",
				eventName: "inventory-item.deleted",
				payload: { inventoryItemId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapInventoryError);
}
