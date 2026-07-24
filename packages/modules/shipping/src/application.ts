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
	shipmentLines,
	shipmentParcels,
	shipments,
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

export const shipmentListQuerySchema = z.object({
	cursor: z.uuid().optional(),
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
			/(NOT_READY_FOR_SHIPPING|NOT_EDITABLE|UNCHANGED|ILLEGAL_TRANSITION|TRACKING_REQUIRED|TRACKING_LOCKED|CONCURRENT_UPDATE|NOT_DELETABLE|OVERSHIPPED)/.test(
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
		limit?: number | string;
		orderId?: string;
		status?: string;
	},
) {
	const page = shipmentListQuerySchema.parse(query);
	const where = and(
		eq(shipments.workspaceId, workspaceId),
		page.cursor ? gt(shipments.id, page.cursor) : undefined,
		page.orderId ? eq(shipments.orderId, page.orderId) : undefined,
		page.status ? eq(shipments.status, page.status) : undefined,
	);
	const rows = await db
		.select()
		.from(shipments)
		.where(where)
		.orderBy(asc(shipments.id))
		.limit(page.limit + 1);
	const hasMore = rows.length > page.limit;
	const items = rows.slice(0, page.limit);
	return {
		items: items.map(serializeShipment),
		page: {
			hasMore,
			nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
		},
	};
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
