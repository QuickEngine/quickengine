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
	resolveSort,
	shipmentLines,
	shipmentParcels,
	shipments,
	toPage,
} from "@quickengine/db";
import { z } from "zod";
import {
	SHIPMENT_STATUSES,
	type ShipmentInput,
	type ShipmentStatus,
	type ShipmentTrackingPatch,
} from "./shipment";
import {
	createShipmentInTx,
	deleteShipmentInTx,
	setShipmentStatusInTx,
	updateDraftShipmentInTx,
	updateShipmentTrackingInTx,
} from "./shipments";

export type ShipmentMutationUnitOfWork =
	MutationUnitOfWork<DatabaseTransaction>;

/**
 * What an operator would order this list by.
 *
 * An allowlist, never a column name from the request: an arbitrary column
 * would let a caller sort by fields the DTO never exposes and read their
 * values off the ordering.
 */
const SHIPMENT_SORTS = {
	trackingNumber: shipments.trackingNumber,
	carrier: shipments.carrier,
	status: shipments.status,
	shippedAt: shipments.shippedAt,
	createdAt: shipments.createdAt,
} as const satisfies SortMap;

export const shipmentListQuerySchema = z.object({
	// Opaque now: it encodes (sortValue, id), so it is no longer a bare uuid.
	cursor: z.string().trim().min(1).optional(),
	direction: z.enum(["asc", "desc"]).default("desc"),
	sort: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	orderId: z.uuid().optional(),
	status: z.enum(SHIPMENT_STATUSES).optional(),
});

const FRIENDLY: Record<string, string> = {
	ORDER_NOT_FOUND: "The order for this shipment was not found.",
	ORDER_NOT_READY_FOR_SHIPPING:
		"Only a confirmed or processing order can be shipped.",
	SHIPMENT_NOT_FOUND: "The shipment was not found.",
	SHIPMENT_NOT_EDITABLE: "Only a draft shipment can be edited.",
	SHIPMENT_ORDER_IMMUTABLE:
		"A shipment can't be moved to a different order. Create a new one instead.",
	SHIPMENT_STATUS_UNCHANGED: "The shipment is already in that status.",
	SHIPMENT_ILLEGAL_TRANSITION: "That shipment status change isn't allowed.",
	SHIPMENT_TRACKING_REQUIRED:
		"Add a tracking number before marking this shipment shipped.",
	SHIPMENT_TRACKING_LOCKED:
		"Tracking can't be changed once a shipment is delivered or cancelled.",
	SHIPMENT_CONCURRENT_UPDATE:
		"The shipment changed while this update was in flight. Try again.",
	SHIPMENT_NOT_DELETABLE: "Only a draft or cancelled shipment can be deleted.",
	ORDER_LINE_NOT_FOUND: "A line on this shipment is not on the order.",
	ORDER_LINE_ORDER_MISMATCH:
		"A line on this shipment belongs to a different order.",
	ORDER_LINE_NOT_SHIPPABLE:
		"A line on this shipment isn't a physical item that can ship.",
	ORDER_LINE_OVERSHIPPED:
		"That would ship more units than the order has remaining.",
	SHIPMENT_HAS_NO_LINES: "A shipment must contain at least one item.",
};

function mapShipmentError(error: unknown): never {
	if (error instanceof DomainError) throw error;
	if (error instanceof Error) {
		const message = FRIENDLY[error.message] ?? error.message;
		if (error.message.endsWith("NOT_FOUND")) {
			throw new DomainError("NOT_FOUND", message);
		}
		if (/NOT_SHIPPABLE|ORDER_MISMATCH|ORDER_IMMUTABLE/.test(error.message)) {
			throw new DomainError("VALIDATION_ERROR", message);
		}
		if (
			/(NOT_READY_FOR_SHIPPING|NOT_EDITABLE|UNCHANGED|ILLEGAL_TRANSITION|TRACKING_REQUIRED|TRACKING_LOCKED|CONCURRENT_UPDATE|NOT_DELETABLE|OVERSHIPPED|HAS_NO_LINES)/.test(
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

const serializeShipment = (row: typeof shipments.$inferSelect) =>
	serializeDates(row);

export type ShipmentDto = ReturnType<typeof serializeShipment>;

export async function listShipmentsPage(
	workspaceId: string,
	query: {
		cursor?: string;
		direction?: string;
		limit?: number | string;
		sort?: string;
		orderId?: string;
		status?: string;
	},
) {
	const page = shipmentListQuerySchema.parse(query);
	// Newest first by default: a list ordered by id is effectively random
	// to the person reading it.
	const sort = resolveSort(SHIPMENT_SORTS, page.sort, "createdAt");
	const where = and(
		eq(shipments.workspaceId, workspaceId),
		afterCursor(
			sort.column,
			shipments.id,
			decodeCursor(page.cursor),
			page.direction,
		),
		page.orderId ? eq(shipments.orderId, page.orderId) : undefined,
		page.status ? eq(shipments.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(shipments)
		.where(where)
		.orderBy(...pageOrder(sort.column, shipments.id, page.direction))
		.limit(page.limit + 1);
	const paged = toPage(rows, page.limit, sort.key, "id");
	return { items: paged.items.map(serializeShipment), page: paged.page };
}

export async function getShipmentDto(workspaceId: string, id: string) {
	const [shipment] = await db
		.select()
		.from(shipments)
		.where(and(eq(shipments.workspaceId, workspaceId), eq(shipments.id, id)))
		.limit(1);
	if (!shipment) return null;
	const [lines, parcels] = await Promise.all([
		db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id)),
		db
			.select()
			.from(shipmentParcels)
			.where(eq(shipmentParcels.shipmentId, id))
			.orderBy(asc(shipmentParcels.position)),
	]);
	return {
		...serializeShipment(shipment),
		lines: lines.map(serializeDates),
		parcels: parcels.map(serializeDates),
	};
}

export function createShipmentCommand(
	context: MutationExecutionContext,
	input: ShipmentInput,
	uow: ShipmentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ShipmentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await createShipmentInTx(
				transaction.db,
				context.workspaceId,
				input,
			);
			await transaction.audit({
				action: "shipment.created",
				metadata: { orderId: row.orderId },
				resourceId: row.id,
				resourceType: "shipment",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "shipment",
				eventName: "shipment.created",
				payload: { orderId: row.orderId, shipmentId: row.id },
				version: 1,
			});
			return { result: serializeShipment(row), status: 201 };
		})
		.catch(mapShipmentError);
}

export function updateDraftShipmentCommand(
	context: MutationExecutionContext,
	id: string,
	input: ShipmentInput,
	uow: ShipmentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ShipmentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateDraftShipmentInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "shipment.updated",
				resourceId: row.id,
				resourceType: "shipment",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "shipment",
				eventName: "shipment.updated",
				payload: { shipmentId: row.id },
				version: 1,
			});
			return { result: serializeShipment(row), status: 200 };
		})
		.catch(mapShipmentError);
}

/**
 * Moving a shipment also moves the delivery record it belongs to (shipped → in progress,
 * delivered → fulfilled, cancelled → cancelled). Both commit in the same transaction, so a
 * shipment can never report delivered while its delivery record disagrees.
 */
export function setShipmentStatusCommand(
	context: MutationExecutionContext,
	id: string,
	status: ShipmentStatus,
	options: { requireTracking?: boolean } = {},
	uow: ShipmentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ShipmentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await setShipmentStatusInTx(
				transaction.db,
				context.workspaceId,
				id,
				status,
				options,
			);
			await transaction.audit({
				action: "shipment.status-changed",
				metadata: { status },
				resourceId: row.id,
				resourceType: "shipment",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "shipment",
				eventName: "shipment.status-changed",
				payload: { shipmentId: row.id, status },
				version: 1,
			});
			return { result: serializeShipment(row), status: 200 };
		})
		.catch(mapShipmentError);
}

export function updateShipmentTrackingCommand(
	context: MutationExecutionContext,
	id: string,
	input: ShipmentTrackingPatch,
	uow: ShipmentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<ShipmentDto>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await updateShipmentTrackingInTx(
				transaction.db,
				context.workspaceId,
				id,
				input,
			);
			await transaction.audit({
				action: "shipment.tracking-updated",
				resourceId: row.id,
				resourceType: "shipment",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "shipment",
				eventName: "shipment.tracking-updated",
				payload: { shipmentId: row.id },
				version: 1,
			});
			return { result: serializeShipment(row), status: 200 };
		})
		.catch(mapShipmentError);
}

export function deleteShipmentCommand(
	context: MutationExecutionContext,
	id: string,
	uow: ShipmentMutationUnitOfWork = mutationUnitOfWork,
): Promise<MutationResult<{ id: string }>> {
	return uow
		.execute(context, async (transaction) => {
			const row = await deleteShipmentInTx(
				transaction.db,
				context.workspaceId,
				id,
			);
			if (!row)
				throw new DomainError("NOT_FOUND", "The shipment was not found.");
			await transaction.audit({
				action: "shipment.deleted",
				resourceId: row.id,
				resourceType: "shipment",
			});
			await transaction.outbox({
				aggregateId: row.id,
				aggregateType: "shipment",
				eventName: "shipment.deleted",
				payload: { shipmentId: row.id },
				version: 1,
			});
			return { result: { id: row.id }, status: 200 };
		})
		.catch(mapShipmentError);
}
