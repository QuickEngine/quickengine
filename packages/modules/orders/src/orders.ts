import {
	and,
	catalogItems,
	catalogItemVariants,
	clientRecords,
	db,
	eq,
	isNull,
	orderLineItems,
	orderSequences,
	orders,
	quickengineWorkspaces,
	sql,
} from "@quickengine/db";
import {
	createFulfillment,
	deleteFulfillment,
} from "@quickengine/mod-fulfillment";
import { type OrderInput, orderInputSchema } from "./order";
import { canTransitionOrder, type OrderStatus } from "./status";
import {
	computeOrderTotals,
	formatOrderNumber,
	orderLineTotalCents,
} from "./totals";

export type CreateOrderInput = OrderInput & { numberPrefix?: string };
export type OrderTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];

export async function allocateOrderSequence(
	tx: OrderTransaction,
	workspaceId: string,
	now = new Date(),
) {
	const [counter] = await tx
		.insert(orderSequences)
		.values({ workspaceId, lastSequence: 1, updatedAt: now })
		.onConflictDoUpdate({
			target: orderSequences.workspaceId,
			set: {
				lastSequence: sql`${orderSequences.lastSequence} + 1`,
				updatedAt: now,
			},
		})
		.returning({ sequence: orderSequences.lastSequence });
	return counter.sequence;
}

async function assertReferences(
	executor: Pick<typeof db, "select">,
	workspaceId: string,
	input: ReturnType<typeof orderInputSchema.parse>,
) {
	const variantOptionsById = new Map<
		string,
		Array<{ name: string; value: string }>
	>();
	const [client] = await executor
		.select({
			workspaceId: clientRecords.workspaceId,
			name: clientRecords.name,
			email: clientRecords.email,
		})
		.from(clientRecords)
		.where(eq(clientRecords.id, input.clientId))
		.limit(1);
	if (!client) {
		throw new Error("CLIENT_NOT_FOUND");
	}
	if (client.workspaceId !== workspaceId) {
		throw new Error("CLIENT_WORKSPACE_MISMATCH");
	}

	for (const line of input.lines) {
		if (!line.catalogItemId) {
			continue;
		}
		const [item] = await executor
			.select({ workspaceId: catalogItems.workspaceId })
			.from(catalogItems)
			.where(eq(catalogItems.id, line.catalogItemId))
			.limit(1);
		if (!item) {
			throw new Error("CATALOG_ITEM_NOT_FOUND");
		}
		if (item.workspaceId !== workspaceId) {
			throw new Error("CATALOG_ITEM_WORKSPACE_MISMATCH");
		}
		if (!line.catalogItemVariantId) {
			continue;
		}
		const [variant] = await executor
			.select({
				workspaceId: catalogItemVariants.workspaceId,
				catalogItemId: catalogItemVariants.catalogItemId,
				options: catalogItemVariants.options,
			})
			.from(catalogItemVariants)
			.where(eq(catalogItemVariants.id, line.catalogItemVariantId))
			.limit(1);
		if (!variant) {
			throw new Error("CATALOG_ITEM_VARIANT_NOT_FOUND");
		}
		if (variant.workspaceId !== workspaceId) {
			throw new Error("CATALOG_ITEM_VARIANT_WORKSPACE_MISMATCH");
		}
		if (variant.catalogItemId !== line.catalogItemId) {
			throw new Error("CATALOG_ITEM_VARIANT_PARENT_MISMATCH");
		}
		variantOptionsById.set(line.catalogItemVariantId, variant.options);
	}
	return { client, variantOptionsById };
}

export async function createOrder(
	workspaceId: string,
	input: CreateOrderInput,
) {
	const parsed = orderInputSchema.parse(input);
	const totals = computeOrderTotals(parsed.lines);

	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1)
			.for("update");
		if (!workspace) {
			throw new Error("WORKSPACE_NOT_FOUND");
		}
		const { client, variantOptionsById } = await assertReferences(
			tx,
			workspaceId,
			parsed,
		);

		const sequence = await allocateOrderSequence(tx, workspaceId);
		const number = formatOrderNumber(input.numberPrefix ?? "ORD", sequence);
		const [order] = await tx
			.insert(orders)
			.values({
				workspaceId,
				clientId: parsed.clientId,
				clientName: client.name,
				clientEmail: client.email,
				sequence,
				number,
				currency: parsed.currency,
				subtotalCents: totals.subtotalCents,
				totalCents: totals.totalCents,
				notes: parsed.notes,
				metadata: parsed.metadata,
			})
			.returning();

		await tx.insert(orderLineItems).values(
			parsed.lines.map((line, position) => ({
				orderId: order.id,
				catalogItemId: line.catalogItemId,
				catalogItemVariantId: line.catalogItemVariantId,
				variantOptions: line.catalogItemVariantId
					? variantOptionsById.get(line.catalogItemVariantId)
					: [],
				name: line.name,
				type: line.type,
				sku: line.sku,
				quantity: line.quantity,
				unitPriceCents: line.unitPriceCents,
				lineTotalCents: orderLineTotalCents(line),
				position,
				metadata: line.metadata,
			})),
		);
		return order;
	});
}

export async function listOrders(workspaceId: string) {
	return db.select().from(orders).where(eq(orders.workspaceId, workspaceId));
}

export async function getOrder(workspaceId: string, id: string) {
	const [order] = await db
		.select()
		.from(orders)
		.where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, id)))
		.limit(1);
	if (!order) {
		return undefined;
	}
	const lines = await db
		.select()
		.from(orderLineItems)
		.where(eq(orderLineItems.orderId, id));
	return { ...order, lines };
}

export async function updateDraftOrder(
	workspaceId: string,
	id: string,
	input: OrderInput,
) {
	const parsed = orderInputSchema.parse(input);
	const totals = computeOrderTotals(parsed.lines);
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: orders.status })
			.from(orders)
			.where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, id)))
			.limit(1)
			.for("update");
		if (!current) {
			throw new Error("ORDER_NOT_FOUND");
		}
		if (current.status !== "draft") {
			throw new Error("ORDER_NOT_EDITABLE");
		}
		const { client, variantOptionsById } = await assertReferences(
			tx,
			workspaceId,
			parsed,
		);
		const [updated] = await tx
			.update(orders)
			.set({
				clientId: parsed.clientId,
				clientName: client.name,
				clientEmail: client.email,
				currency: parsed.currency,
				subtotalCents: totals.subtotalCents,
				totalCents: totals.totalCents,
				notes: parsed.notes,
				metadata: parsed.metadata,
				updatedAt: new Date(),
			})
			.where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, id)))
			.returning();
		await tx.delete(orderLineItems).where(eq(orderLineItems.orderId, id));
		await tx.insert(orderLineItems).values(
			parsed.lines.map((line, position) => ({
				orderId: id,
				catalogItemId: line.catalogItemId,
				catalogItemVariantId: line.catalogItemVariantId,
				variantOptions: line.catalogItemVariantId
					? variantOptionsById.get(line.catalogItemVariantId)
					: [],
				name: line.name,
				type: line.type,
				sku: line.sku,
				quantity: line.quantity,
				unitPriceCents: line.unitPriceCents,
				lineTotalCents: orderLineTotalCents(line),
				position,
				metadata: line.metadata,
			})),
		);
		return updated;
	});
}

export async function setOrderStatus(
	workspaceId: string,
	id: string,
	status: OrderStatus,
) {
	const current = await getOrder(workspaceId, id);
	if (!current) {
		throw new Error("ORDER_NOT_FOUND");
	}
	if (current.status === status) {
		throw new Error("ORDER_STATUS_UNCHANGED");
	}
	if (!canTransitionOrder(current.status, status)) {
		throw new Error("ORDER_ILLEGAL_TRANSITION");
	}
	const now = new Date();
	const timestamp = {
		placed: { placedAt: now },
		confirmed: { confirmedAt: now },
		processing: { processingAt: now },
		fulfilled: { fulfilledAt: now },
		cancelled: { cancelledAt: now },
		draft: {},
	}[status];
	const [updated] = await db
		.update(orders)
		.set({ status, ...timestamp, updatedAt: now })
		.where(
			and(
				eq(orders.workspaceId, workspaceId),
				eq(orders.id, id),
				eq(orders.status, current.status),
			),
		)
		.returning();
	if (!updated) {
		throw new Error("ORDER_CONCURRENT_UPDATE");
	}
	return updated;
}

export async function ensureOrderFulfillment(workspaceId: string, id: string) {
	const order = await getOrder(workspaceId, id);
	if (!order) {
		throw new Error("ORDER_NOT_FOUND");
	}
	if (!["confirmed", "processing"].includes(order.status)) {
		throw new Error("ORDER_NOT_READY_FOR_FULFILLMENT");
	}
	if (order.fulfillmentId) {
		return order.fulfillmentId;
	}
	const types = new Set(order.lines.map((line) => line.type));
	const kind =
		types.has("physical") || types.has("rental")
			? "physical"
			: types.size === 1 && types.has("digital")
				? "digital"
				: types.size === 1 && types.has("service")
					? "service"
					: "other";
	const fulfillment = await createFulfillment(workspaceId, {
		title: `Order ${order.number}`,
		kind,
		clientId: order.clientId,
		details: { orderId: order.id, orderNumber: order.number },
	});
	const [linked] = await db
		.update(orders)
		.set({ fulfillmentId: fulfillment.id, updatedAt: new Date() })
		.where(
			and(
				eq(orders.workspaceId, workspaceId),
				eq(orders.id, id),
				isNull(orders.fulfillmentId),
			),
		)
		.returning({ fulfillmentId: orders.fulfillmentId });
	if (!linked?.fulfillmentId) {
		await deleteFulfillment(fulfillment.id);
		const latest = await getOrder(workspaceId, id);
		if (!latest?.fulfillmentId) {
			throw new Error("ORDER_FULFILLMENT_LINK_FAILED");
		}
		return latest.fulfillmentId;
	}
	return linked.fulfillmentId;
}

export async function deleteOrder(workspaceId: string, id: string) {
	const current = await getOrder(workspaceId, id);
	if (!current) {
		throw new Error("ORDER_NOT_FOUND");
	}
	if (current.status !== "draft" && current.status !== "cancelled") {
		throw new Error("ORDER_NOT_DELETABLE");
	}
	const [deleted] = await db
		.delete(orders)
		.where(and(eq(orders.workspaceId, workspaceId), eq(orders.id, id)))
		.returning();
	return deleted;
}
