import {
	and,
	db,
	eq,
	ne,
	orderLineItems,
	orders,
	shipmentLines,
	shipmentParcels,
	shipments,
} from "@quickengine/db";
import {
	createFulfillment,
	deleteFulfillment,
	setFulfillmentStatus,
} from "@quickengine/mod-fulfillment";
import {
	assertShipmentQuantityAllowed,
	canTransitionShipment,
	type ShipmentInput,
	type ShipmentStatus,
	type ShipmentTrackingPatch,
	shipmentInputSchema,
	shipmentTrackingPatchSchema,
} from "./shipment";

async function assertShippableLines(
	executor: Pick<typeof db, "select">,
	workspaceId: string,
	orderId: string,
	requested: ReadonlyArray<{ orderLineItemId: string; quantity: number }>,
	excludeShipmentId?: string,
) {
	const orderLines = await executor
		.select({
			id: orderLineItems.id,
			orderId: orderLineItems.orderId,
			type: orderLineItems.type,
			quantity: orderLineItems.quantity,
		})
		.from(orderLineItems)
		.where(eq(orderLineItems.orderId, orderId));
	const byId = new Map(orderLines.map((line) => [line.id, line]));

	const allocationConditions = [
		eq(shipments.workspaceId, workspaceId),
		eq(shipments.orderId, orderId),
		ne(shipments.status, "cancelled"),
	];
	if (excludeShipmentId) {
		allocationConditions.push(ne(shipments.id, excludeShipmentId));
	}
	const allocatedRows = await executor
		.select({
			orderLineItemId: shipmentLines.orderLineItemId,
			quantity: shipmentLines.quantity,
		})
		.from(shipmentLines)
		.innerJoin(shipments, eq(shipments.id, shipmentLines.shipmentId))
		.where(and(...allocationConditions));
	const allocated = new Map<string, number>();
	for (const row of allocatedRows) {
		allocated.set(
			row.orderLineItemId,
			(allocated.get(row.orderLineItemId) ?? 0) + row.quantity,
		);
	}

	for (const line of requested) {
		const source = byId.get(line.orderLineItemId);
		if (!source) throw new Error("ORDER_LINE_NOT_FOUND");
		if (source.orderId !== orderId)
			throw new Error("ORDER_LINE_ORDER_MISMATCH");
		if (source.type !== "physical" && source.type !== "rental") {
			throw new Error("ORDER_LINE_NOT_SHIPPABLE");
		}
		assertShipmentQuantityAllowed(
			source.quantity,
			allocated.get(source.id) ?? 0,
			line.quantity,
		);
	}
}

async function replaceShipmentChildren(
	executor: Pick<typeof db, "delete" | "insert">,
	shipmentId: string,
	input: ReturnType<typeof shipmentInputSchema.parse>,
) {
	await executor
		.delete(shipmentLines)
		.where(eq(shipmentLines.shipmentId, shipmentId));
	await executor
		.delete(shipmentParcels)
		.where(eq(shipmentParcels.shipmentId, shipmentId));
	await executor.insert(shipmentLines).values(
		input.lines.map((line) => ({
			shipmentId,
			orderLineItemId: line.orderLineItemId,
			quantity: line.quantity,
		})),
	);
	await executor.insert(shipmentParcels).values(
		input.parcels.map((parcel, position) => ({
			shipmentId,
			position,
			...parcel,
		})),
	);
}

export async function createShipment(
	workspaceId: string,
	input: ShipmentInput,
) {
	const parsed = shipmentInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const [order] = await tx
			.select({
				id: orders.id,
				number: orders.number,
				clientId: orders.clientId,
				status: orders.status,
			})
			.from(orders)
			.where(
				and(eq(orders.workspaceId, workspaceId), eq(orders.id, parsed.orderId)),
			)
			.limit(1)
			.for("update");
		if (!order) throw new Error("ORDER_NOT_FOUND");
		if (order.status !== "confirmed" && order.status !== "processing") {
			throw new Error("ORDER_NOT_READY_FOR_SHIPPING");
		}
		await assertShippableLines(tx, workspaceId, order.id, parsed.lines);
		const fulfillment = await createFulfillment(
			workspaceId,
			{
				title: `Shipment for order ${order.number}`,
				kind: "physical",
				clientId: order.clientId,
				details: { orderId: order.id, orderNumber: order.number },
			},
			tx,
		);
		const [shipment] = await tx
			.insert(shipments)
			.values({
				workspaceId,
				orderId: order.id,
				fulfillmentId: fulfillment.id,
				destination: parsed.destination,
				carrier: parsed.carrier,
				serviceLevel: parsed.serviceLevel,
				trackingNumber: parsed.trackingNumber,
				trackingUrl: parsed.trackingUrl,
				metadata: parsed.metadata,
			})
			.returning();
		await replaceShipmentChildren(tx, shipment.id, parsed);
		return shipment;
	});
}

export async function listShipments(workspaceId: string, orderId?: string) {
	return db
		.select()
		.from(shipments)
		.where(
			orderId
				? and(
						eq(shipments.workspaceId, workspaceId),
						eq(shipments.orderId, orderId),
					)
				: eq(shipments.workspaceId, workspaceId),
		);
}

export async function getShipment(workspaceId: string, id: string) {
	const [shipment] = await db
		.select()
		.from(shipments)
		.where(and(eq(shipments.workspaceId, workspaceId), eq(shipments.id, id)))
		.limit(1);
	if (!shipment) return undefined;
	const [lines, parcels] = await Promise.all([
		db.select().from(shipmentLines).where(eq(shipmentLines.shipmentId, id)),
		db.select().from(shipmentParcels).where(eq(shipmentParcels.shipmentId, id)),
	]);
	return { ...shipment, lines, parcels };
}

export async function updateDraftShipment(
	workspaceId: string,
	id: string,
	input: ShipmentInput,
) {
	const parsed = shipmentInputSchema.parse(input);
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ orderId: shipments.orderId, status: shipments.status })
			.from(shipments)
			.where(and(eq(shipments.workspaceId, workspaceId), eq(shipments.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("SHIPMENT_NOT_FOUND");
		if (current.status !== "draft") throw new Error("SHIPMENT_NOT_EDITABLE");
		if (parsed.orderId !== current.orderId) {
			throw new Error("SHIPMENT_ORDER_IMMUTABLE");
		}
		const [order] = await tx
			.select({ id: orders.id })
			.from(orders)
			.where(
				and(
					eq(orders.workspaceId, workspaceId),
					eq(orders.id, current.orderId),
				),
			)
			.limit(1)
			.for("update");
		if (!order) throw new Error("ORDER_NOT_FOUND");
		await assertShippableLines(tx, workspaceId, order.id, parsed.lines, id);
		const [updated] = await tx
			.update(shipments)
			.set({
				destination: parsed.destination,
				carrier: parsed.carrier,
				serviceLevel: parsed.serviceLevel,
				trackingNumber: parsed.trackingNumber,
				trackingUrl: parsed.trackingUrl,
				metadata: parsed.metadata,
				updatedAt: new Date(),
			})
			.where(and(eq(shipments.workspaceId, workspaceId), eq(shipments.id, id)))
			.returning();
		await replaceShipmentChildren(tx, id, parsed);
		return updated;
	});
}

export async function setShipmentStatus(
	workspaceId: string,
	id: string,
	status: ShipmentStatus,
	options: { requireTracking?: boolean } = {},
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({
				status: shipments.status,
				fulfillmentId: shipments.fulfillmentId,
				trackingNumber: shipments.trackingNumber,
			})
			.from(shipments)
			.where(and(eq(shipments.workspaceId, workspaceId), eq(shipments.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("SHIPMENT_NOT_FOUND");
		if (current.status === status) throw new Error("SHIPMENT_STATUS_UNCHANGED");
		if (!canTransitionShipment(current.status, status)) {
			throw new Error("SHIPMENT_ILLEGAL_TRANSITION");
		}
		if (
			status === "shipped" &&
			options.requireTracking &&
			!current.trackingNumber
		) {
			throw new Error("SHIPMENT_TRACKING_REQUIRED");
		}
		const now = new Date();
		const timestamps = {
			draft: {},
			ready: {},
			shipped: { shippedAt: now },
			in_transit: { inTransitAt: now },
			delivered: { deliveredAt: now },
			exception: {},
			cancelled: { cancelledAt: now },
		}[status];
		const [updated] = await tx
			.update(shipments)
			.set({ status, ...timestamps, updatedAt: now })
			.where(and(eq(shipments.id, id), eq(shipments.status, current.status)))
			.returning();
		if (!updated) throw new Error("SHIPMENT_CONCURRENT_UPDATE");
		if (status === "shipped") {
			await setFulfillmentStatus(current.fulfillmentId, "in_progress", tx);
		} else if (status === "delivered") {
			await setFulfillmentStatus(current.fulfillmentId, "fulfilled", tx);
		} else if (status === "cancelled") {
			await setFulfillmentStatus(current.fulfillmentId, "cancelled", tx);
		}
		return updated;
	});
}

export async function updateShipmentTracking(
	workspaceId: string,
	id: string,
	input: ShipmentTrackingPatch,
) {
	const parsed = shipmentTrackingPatchSchema.parse(input);
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: shipments.status })
			.from(shipments)
			.where(and(eq(shipments.workspaceId, workspaceId), eq(shipments.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("SHIPMENT_NOT_FOUND");
		if (current.status === "delivered" || current.status === "cancelled") {
			throw new Error("SHIPMENT_TRACKING_LOCKED");
		}
		const [updated] = await tx
			.update(shipments)
			.set({ ...parsed, updatedAt: new Date() })
			.where(and(eq(shipments.workspaceId, workspaceId), eq(shipments.id, id)))
			.returning();
		return updated;
	});
}

export async function deleteShipment(workspaceId: string, id: string) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({
				status: shipments.status,
				fulfillmentId: shipments.fulfillmentId,
			})
			.from(shipments)
			.where(and(eq(shipments.workspaceId, workspaceId), eq(shipments.id, id)))
			.limit(1)
			.for("update");
		if (!current) throw new Error("SHIPMENT_NOT_FOUND");
		if (current.status !== "draft" && current.status !== "cancelled") {
			throw new Error("SHIPMENT_NOT_DELETABLE");
		}
		const [deleted] = await tx
			.delete(shipments)
			.where(and(eq(shipments.workspaceId, workspaceId), eq(shipments.id, id)))
			.returning();
		await deleteFulfillment(current.fulfillmentId, tx);
		return deleted;
	});
}
