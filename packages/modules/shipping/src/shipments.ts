import {
	and,
	db,
	desc,
	eq,
	fulfillments,
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
	shippingAddressSchema,
} from "./shipment";

export type ShipmentTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];

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

export async function createShipmentInTx(
	tx: ShipmentTransaction,
	workspaceId: string,
	input: ShipmentInput,
) {
	const parsed = shipmentInputSchema.parse(input);
	{
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
	}
}

/**
 * A shipment somebody ELSE packed and shipped.
 *
 * 🔴 The dropship case: a supplier fulfils an order in its own system and tells
 * us. It is still a real shipment, deliberately not a special case — teaching
 * the notification path a new branch would duplicate logic and leave the portal
 * and the operator list empty for exactly the orders a dropshipping business
 * sells.
 *
 * Three things differ from `createShipmentInTx`:
 *
 * 1. **Zero parcel rows.** The `.min(1)` on parcels lives only in
 *    `shipmentInputSchema`, and nothing requires a shipment to HAVE parcels.
 *    This business never touched the box; inventing a weight would poison
 *    rate-shopping later with a number nobody measured.
 * 2. **`sourceModule` / `sourceRecordId` are populated** — the first caller ever
 *    to do so, which finally arms the dormant `fulfillments_source_unique`
 *    index. That is what makes a redelivered webhook produce ONE shipment
 *    however often it arrives, enforced by the database rather than by us
 *    remembering to check.
 * 3. **It returns null instead of throwing** when that index says the shipment
 *    already exists. At-least-once delivery makes that the normal case.
 *
 * ⚠️ Does NOT move the order. Shipment creation still demands `confirmed` or
 * `processing`, and settlement leaves a paid order at `placed`, so the caller
 * walks it forward first — in the same transaction. That coordination lives at
 * the API layer beside `settlePaidCheckout` rather than here, so shipping does
 * not take a dependency on orders.
 */
export async function recordSupplierShipmentInTx(
	tx: ShipmentTransaction,
	workspaceId: string,
	input: {
		orderId: string;
		/** Opaque to shipping. `purchase_orders` is the only value today. */
		sourceModule: string;
		sourceRecordId: string;
		lines: ReadonlyArray<{ orderLineItemId: string; quantity: number }>;
		carrier?: string | null;
		trackingNumber?: string | null;
		trackingUrl?: string | null;
		metadata?: Record<string, unknown>;
	},
) {
	/**
	 * 🔴 FIRST, before anything that can throw.
	 *
	 * A redelivery must return null, never raise — a thrown error is a 500, and a
	 * provider answered 500 redelivers forever. Every check below it fails on a
	 * redelivery for a reason that looks like a fault and is not: the lines are
	 * already allocated to the shipment this call made last time
	 * (`ORDER_LINE_OVERSHIPPED`), and by the time the parcel is delivered the
	 * order has moved past shippable (`ORDER_NOT_READY_FOR_SHIPPING`).
	 *
	 * ⚠️ Found by a test, not by reading. The first version of this function
	 * relied on `createFulfillment` raising `FULFILLMENT_SOURCE_EXISTS`, which is
	 * three checks too late to ever be reached.
	 */
	const [alreadyRecorded] = await tx
		.select({ id: fulfillments.id })
		.from(fulfillments)
		.where(
			and(
				eq(fulfillments.workspaceId, workspaceId),
				eq(fulfillments.sourceModule, input.sourceModule),
				eq(fulfillments.sourceRecordId, input.sourceRecordId),
			),
		)
		.limit(1);
	if (alreadyRecorded) return null;

	const [order] = await tx
		.select({
			id: orders.id,
			number: orders.number,
			clientId: orders.clientId,
			status: orders.status,
			shipToName: orders.shipToName,
			shipToLine1: orders.shipToLine1,
			shipToLine2: orders.shipToLine2,
			shipToCity: orders.shipToCity,
			shipToRegion: orders.shipToRegion,
			shipToPostalCode: orders.shipToPostalCode,
			shipToCountryCode: orders.shipToCountryCode,
		})
		.from(orders)
		.where(
			and(eq(orders.workspaceId, workspaceId), eq(orders.id, input.orderId)),
		)
		.limit(1)
		.for("update");
	if (!order) throw new Error("ORDER_NOT_FOUND");
	if (order.status !== "confirmed" && order.status !== "processing") {
		throw new Error("ORDER_NOT_READY_FOR_SHIPPING");
	}

	/**
	 * 🔴 Refused rather than shipped empty. A shipment with no lines tells a
	 * customer their order is on its way while claiming nothing is in the box,
	 * and it silently consumes the one shipment this purchase order is allowed.
	 */
	if (input.lines.length === 0) throw new Error("SHIPMENT_HAS_NO_LINES");

	/**
	 * Snapshotted from the order, the same address the supplier was given.
	 *
	 * ⚠️ `email` is deliberately left null. Nothing reads it — the customer
	 * notification takes the address from the ORDER — and a delivery address is
	 * not a place to keep a second copy of somebody's inbox.
	 */
	const destination = shippingAddressSchema.parse({
		recipientName: order.shipToName,
		line1: order.shipToLine1,
		city: order.shipToCity,
		region: order.shipToRegion,
		postalCode: order.shipToPostalCode,
		countryCode: order.shipToCountryCode,
		line2: order.shipToLine2,
	});

	await assertShippableLines(tx, workspaceId, order.id, input.lines);

	/**
	 * The read above is the fast path; `fulfillments_source_unique` is the one
	 * that actually holds. Two concurrent redeliveries can both pass the read,
	 * and only the database can stop the second — which it does by raising here,
	 * rolling the whole transaction back rather than shipping twice.
	 */
	const fulfillment = await createFulfillment(
		workspaceId,
		{
			title: `Shipment for order ${order.number}`,
			kind: "physical",
			clientId: order.clientId,
			sourceModule: input.sourceModule,
			sourceRecordId: input.sourceRecordId,
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
			destination,
			carrier: input.carrier ?? null,
			serviceLevel: null,
			trackingNumber: input.trackingNumber ?? null,
			trackingUrl: input.trackingUrl ?? null,
			metadata: input.metadata ?? {},
		})
		.returning();

	// Lines only. See the parcel note above.
	await tx.insert(shipmentLines).values(
		input.lines.map((line) => ({
			shipmentId: shipment.id,
			orderLineItemId: line.orderLineItemId,
			quantity: line.quantity,
		})),
	);

	/**
	 * `draft -> ready -> shipped`, both hops, because the transition table has no
	 * edge straight from draft. Going through `setShipmentStatusInTx` rather than
	 * writing the column is what keeps the delivery record in step: reaching
	 * `shipped` moves the fulfilment to `in_progress` in this same transaction.
	 */
	await setShipmentStatusInTx(tx, workspaceId, shipment.id, "ready");
	return setShipmentStatusInTx(tx, workspaceId, shipment.id, "shipped");
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
		)
		.orderBy(desc(shipments.createdAt), desc(shipments.id));
}

/**
 * How much of each order line has already gone out, keyed by order line id.
 *
 * 🔴 Without this nothing can tell what is still OUTSTANDING on an order, so a
 * fulfilment screen offers to ship quantities that already shipped and the API
 * refuses after the form has been filled in.
 *
 * ⚠️ Cancelled shipments do not count. A cancelled parcel never left, so its
 * lines are owed again — treating them as shipped would strand the remainder
 * with no way to send it.
 *
 * Summed in JS rather than SQL: an order has a handful of shipment lines, and
 * an aggregate here would need a group-by whose types fight the driver for no
 * benefit at this size.
 */
export async function shippedQuantitiesForOrder(
	workspaceId: string,
	orderId: string,
): Promise<Record<string, number>> {
	const rows = await db
		.select({
			orderLineItemId: shipmentLines.orderLineItemId,
			quantity: shipmentLines.quantity,
			status: shipments.status,
		})
		.from(shipmentLines)
		.innerJoin(shipments, eq(shipments.id, shipmentLines.shipmentId))
		.where(
			and(
				eq(shipments.workspaceId, workspaceId),
				eq(shipments.orderId, orderId),
			),
		);

	const totals: Record<string, number> = {};
	for (const row of rows) {
		if (row.status === "cancelled") continue;
		totals[row.orderLineItemId] =
			(totals[row.orderLineItemId] ?? 0) + row.quantity;
	}
	return totals;
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

export async function updateDraftShipmentInTx(
	tx: ShipmentTransaction,
	workspaceId: string,
	id: string,
	input: ShipmentInput,
) {
	const parsed = shipmentInputSchema.parse(input);
	{
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
	}
}

export async function setShipmentStatusInTx(
	tx: ShipmentTransaction,
	workspaceId: string,
	id: string,
	status: ShipmentStatus,
	options: { requireTracking?: boolean } = {},
) {
	{
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
			await setFulfillmentStatus(
				workspaceId,
				current.fulfillmentId,
				"in_progress",
				tx,
			);
		} else if (status === "delivered") {
			await setFulfillmentStatus(
				workspaceId,
				current.fulfillmentId,
				"fulfilled",
				tx,
			);
		} else if (status === "cancelled") {
			await setFulfillmentStatus(
				workspaceId,
				current.fulfillmentId,
				"cancelled",
				tx,
			);
		}
		return updated;
	}
}

export async function updateShipmentTrackingInTx(
	tx: ShipmentTransaction,
	workspaceId: string,
	id: string,
	input: ShipmentTrackingPatch,
) {
	const parsed = shipmentTrackingPatchSchema.parse(input);
	{
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
	}
}

export async function deleteShipmentInTx(
	tx: ShipmentTransaction,
	workspaceId: string,
	id: string,
) {
	{
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
		await deleteFulfillment(workspaceId, current.fulfillmentId, tx);
		return deleted;
	}
}

export async function createShipment(
	workspaceId: string,
	input: ShipmentInput,
) {
	return db.transaction((tx) => createShipmentInTx(tx, workspaceId, input));
}

export async function updateDraftShipment(
	workspaceId: string,
	id: string,
	input: ShipmentInput,
) {
	return db.transaction((tx) =>
		updateDraftShipmentInTx(tx, workspaceId, id, input),
	);
}

export async function setShipmentStatus(
	workspaceId: string,
	id: string,
	status: ShipmentStatus,
	options: { requireTracking?: boolean } = {},
) {
	return db.transaction((tx) =>
		setShipmentStatusInTx(tx, workspaceId, id, status, options),
	);
}

export async function updateShipmentTracking(
	workspaceId: string,
	id: string,
	input: ShipmentTrackingPatch,
) {
	return db.transaction((tx) =>
		updateShipmentTrackingInTx(tx, workspaceId, id, input),
	);
}

export async function deleteShipment(workspaceId: string, id: string) {
	return db.transaction((tx) => deleteShipmentInTx(tx, workspaceId, id));
}
