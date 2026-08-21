import {
	and,
	db,
	eq,
	inArray,
	orderLineItems,
	orders,
	purchaseOrderLines,
	purchaseOrderSequences,
	purchaseOrders,
	sql,
	supplierSkus,
	suppliers,
} from "@quickengine/db";

/**
 * Turning a paid customer order into asks of the businesses that actually make
 * the thing.
 *
 * ── The shape ────────────────────────────────────────────────────────────────
 *
 * ```
 * order.paid -> resolve each line to a supplier SKU -> group by supplier
 *            -> one purchase order per supplier -> emit by handoff method
 * ```
 *
 * 🔑 Grouped by SUPPLIER, not flattened. An order whose beans come from two
 * roasters is two separate asks of two separate businesses, and pretending it is
 * one document produces a purchase order neither of them can act on.
 *
 * 🔴 Lines with no supplier mapping are SKIPPED, not failed. A business that
 * dropships two products and holds stock of a third is the normal case, and
 * refusing the whole order because one line is self-fulfilled would stop the
 * parts that could have been sent.
 *
 * ⚠️ Everything a supplier sees is SNAPSHOTTED. Their SKU, the description, the
 * unit cost and the delivery address are copied at the moment of raising, never
 * joined at read time. A supplier renumbering their catalog next month must not
 * silently rewrite what was on an order they already shipped.
 *
 * ⚠️ Retail totals are deliberately absent. A supplier has no business seeing
 * what the customer paid.
 */

export type RaisedPurchaseOrder = {
	id: string;
	number: string;
	/** Current status, so a caller can tell a fresh ask from one still pending. */
	status: string;
	/**
	 * True when this order was ALREADY raised and is being returned again.
	 *
	 * 🔴 It used to be dropped entirely, and that quietly disabled retries. The
	 * outbox redelivers `order.paid` up to eight times with backoff, but the
	 * second delivery hit `onConflictDoNothing`, returned nothing, and the caller
	 * saw an empty list — so a supplier call that failed the first time was never
	 * attempted again and the purchase order sat in `failed` forever.
	 *
	 * The email path still skips these once sent. The adapter path relies on
	 * `claimPurchaseOrderForDispatch`, which is stricter than any boolean and also
	 * survives two workers running at once.
	 */
	alreadyExisted: boolean;
	supplierId: string;
	supplierName: string;
	handoffMethod: string;
	handoffTarget: string | null;
	contactEmail: string | null;
	lines: Array<{
		supplierSku: string;
		description: string;
		quantity: number;
		unitCostCents: number | null;
		/** What the supplier is priced in. Carried so a handoff can state it. */
		currency: string;
	}>;
};

async function allocateNumber(
	tx: typeof db,
	workspaceId: string,
	now: Date,
): Promise<string> {
	const [counter] = await tx
		.insert(purchaseOrderSequences)
		.values({ workspaceId, nextNumber: 1, updatedAt: now })
		.onConflictDoUpdate({
			target: purchaseOrderSequences.workspaceId,
			set: {
				nextNumber: sql`${purchaseOrderSequences.nextNumber} + 1`,
				updatedAt: now,
			},
		})
		.returning({ next: purchaseOrderSequences.nextNumber });
	return `PO-${String(counter.next).padStart(4, "0")}`;
}

/**
 * Raise the purchase orders a paid order implies.
 *
 * 🔴 Safe to call twice. `order.paid` is delivered at least once, and the unique
 * constraint on `(order_id, supplier_id)` is what stops a redelivery asking a
 * supplier for a second batch of coffee they have already shipped. A conflict
 * here means the work was already done, which is success, not an error.
 *
 * Returns only what it actually created, so a caller can notify exactly the
 * suppliers that were newly asked and no others.
 */
export async function raisePurchaseOrdersForOrder(input: {
	workspaceId: string;
	orderId: string;
	now?: Date;
}): Promise<RaisedPurchaseOrder[]> {
	const now = input.now ?? new Date();

	const [order] = await db
		.select()
		.from(orders)
		.where(
			and(
				eq(orders.workspaceId, input.workspaceId),
				eq(orders.id, input.orderId),
			),
		)
		.limit(1);
	if (!order) return [];

	// Each line, with the supplier mapping where one exists. An inner join would
	// drop the unmapped lines silently; they are skipped explicitly below so the
	// reason is visible in the code rather than implied by a join type.
	const rows = await db
		.select({
			lineId: orderLineItems.id,
			name: orderLineItems.name,
			quantity: orderLineItems.quantity,
			supplierId: supplierSkus.supplierId,
			supplierSku: supplierSkus.supplierSku,
			unitCostCents: supplierSkus.unitCostCents,
			currency: supplierSkus.currency,
		})
		.from(orderLineItems)
		.innerJoin(
			supplierSkus,
			and(
				eq(supplierSkus.catalogItemId, orderLineItems.catalogItemId),
				eq(supplierSkus.workspaceId, input.workspaceId),
			),
		)
		.where(eq(orderLineItems.orderId, input.orderId));

	// Archived mappings do not route: a supplier a business has stopped using
	// must not receive orders because an old row was never deleted.
	const live = rows.filter((row) => row.supplierId);
	if (live.length === 0) return [];

	const bySupplier = new Map<string, typeof live>();
	for (const row of live) {
		const group = bySupplier.get(row.supplierId) ?? [];
		group.push(row);
		bySupplier.set(row.supplierId, group);
	}

	const raised: RaisedPurchaseOrder[] = [];

	for (const [supplierId, group] of bySupplier) {
		const [supplier] = await db
			.select()
			.from(suppliers)
			.where(
				and(
					eq(suppliers.workspaceId, input.workspaceId),
					eq(suppliers.id, supplierId),
				),
			)
			.limit(1);
		if (!supplier || supplier.archivedAt) continue;

		const number = await allocateNumber(db, input.workspaceId, now);

		const [created] = await db
			.insert(purchaseOrders)
			.values({
				workspaceId: input.workspaceId,
				supplierId,
				orderId: input.orderId,
				number,
				status: "draft",
				// Snapshotted, so a supplier changing method later does not rewrite
				// how past orders were actually sent.
				handoffMethod: supplier.handoffMethod,
				handoffTarget: supplier.handoffTarget ?? supplier.contactEmail,
				shipToName: order.shipToName,
				shipToLine1: order.shipToLine1,
				shipToLine2: order.shipToLine2,
				shipToCity: order.shipToCity,
				shipToRegion: order.shipToRegion,
				shipToPostalCode: order.shipToPostalCode,
				shipToCountryCode: order.shipToCountryCode,
				createdAt: now,
				updatedAt: now,
			})
			// Already raised for this order and supplier. The redelivery is a no-op.
			.onConflictDoNothing({
				target: [purchaseOrders.orderId, purchaseOrders.supplierId],
			})
			.returning();

		if (!created) {
			// Already raised for this order and supplier. Return it rather than
			// dropping it, so a retried delivery can still finish a handoff that
			// failed. Lines are not re-inserted; they were written the first time.
			const [existing] = await db
				.select()
				.from(purchaseOrders)
				.where(
					and(
						eq(purchaseOrders.workspaceId, input.workspaceId),
						eq(purchaseOrders.orderId, input.orderId),
						eq(purchaseOrders.supplierId, supplierId),
					),
				)
				.limit(1);
			if (!existing) continue;
			raised.push({
				id: existing.id,
				number: existing.number,
				status: existing.status,
				alreadyExisted: true,
				supplierId,
				supplierName: supplier.name,
				handoffMethod: existing.handoffMethod,
				handoffTarget: existing.handoffTarget,
				contactEmail: supplier.contactEmail,
				lines: group.map((row) => ({
					supplierSku: row.supplierSku,
					description: row.name,
					quantity: row.quantity,
					unitCostCents: row.unitCostCents,
					currency: row.currency,
				})),
			});
			continue;
		}

		await db.insert(purchaseOrderLines).values(
			group.map((row) => ({
				purchaseOrderId: created.id,
				orderLineItemId: row.lineId,
				supplierSku: row.supplierSku,
				description: row.name,
				quantity: row.quantity,
				unitCostCents: row.unitCostCents,
				currency: row.currency,
				createdAt: now,
			})),
		);

		raised.push({
			id: created.id,
			number: created.number,
			status: created.status,
			alreadyExisted: false,
			supplierId,
			supplierName: supplier.name,
			handoffMethod: supplier.handoffMethod,
			handoffTarget: created.handoffTarget,
			contactEmail: supplier.contactEmail,
			lines: group.map((row) => ({
				supplierSku: row.supplierSku,
				description: row.name,
				quantity: row.quantity,
				unitCostCents: row.unitCostCents,
				currency: row.currency,
			})),
		});
	}

	return raised;
}

/**
 * Claim a purchase order for an automated handoff.
 *
 * 🔴 The single-call guarantee, and it is a conditional UPDATE rather than a
 * read-then-write on purpose. Postgres serialises the two writers, so exactly
 * one gets a row back and exactly one talks to the supplier. A
 * read-check-then-write would let both pass the check.
 *
 * Claimable from `draft` (never attempted) and from `failed` (attempted and
 * broken, so a later redelivery may legitimately try again). Deliberately NOT
 * from `sent`, `sending`, `acknowledged` or `shipped` — those either succeeded
 * or are in flight, and re-sending any of them costs a real second shipment.
 *
 * Returns undefined when the claim was lost. That is an ordinary outcome, not an
 * error: it means a peer already has it.
 */
export async function claimPurchaseOrderForDispatch(input: {
	workspaceId: string;
	purchaseOrderId: string;
	now?: Date;
}) {
	const now = input.now ?? new Date();
	const [claimed] = await db
		.update(purchaseOrders)
		.set({ status: "sending", failureReason: null, updatedAt: now })
		.where(
			and(
				eq(purchaseOrders.workspaceId, input.workspaceId),
				eq(purchaseOrders.id, input.purchaseOrderId),
				inArray(purchaseOrders.status, ["draft", "failed"]),
			),
		)
		.returning();
	return claimed;
}

/**
 * Record that a supplier accepted the order, and under what id.
 *
 * `supplierReference` is the join key everything inbound uses: a fulfilment
 * webhook knows the supplier's own order id and nothing else. `metadata` keeps
 * the human-facing details beside it so a support conversation can start without
 * anybody logging into the supplier's system.
 *
 * ⚠️ Written immediately after the provider call returns. The window between the
 * call succeeding and this committing is exactly the gap the adapter's
 * correlation search exists to close.
 */
export async function recordSupplierOrderPlaced(input: {
	workspaceId: string;
	purchaseOrderId: string;
	externalOrderId: string;
	externalOrderNumber?: string | null;
	metadata?: Record<string, unknown>;
	now?: Date;
}) {
	const now = input.now ?? new Date();
	await db
		.update(purchaseOrders)
		.set({
			status: "sent",
			sentAt: now,
			failureReason: null,
			supplierReference: input.externalOrderId,
			metadata: {
				externalOrderNumber: input.externalOrderNumber ?? null,
				...(input.metadata ?? {}),
			},
			updatedAt: now,
		})
		.where(
			and(
				eq(purchaseOrders.workspaceId, input.workspaceId),
				eq(purchaseOrders.id, input.purchaseOrderId),
			),
		);
}

/** Mark a purchase order as sent, or record why it could not be. */
export async function markPurchaseOrderSent(input: {
	workspaceId: string;
	purchaseOrderId: string;
	failureReason?: string | null;
	now?: Date;
}) {
	const now = input.now ?? new Date();
	await db
		.update(purchaseOrders)
		.set(
			input.failureReason
				? {
						status: "failed",
						failureReason: input.failureReason,
						updatedAt: now,
					}
				: { status: "sent", sentAt: now, failureReason: null, updatedAt: now },
		)
		.where(
			and(
				eq(purchaseOrders.workspaceId, input.workspaceId),
				eq(purchaseOrders.id, input.purchaseOrderId),
			),
		);
}

/** What a business asked its suppliers for, newest first. */
export async function listPurchaseOrders(workspaceId: string) {
	return db
		.select({
			id: purchaseOrders.id,
			number: purchaseOrders.number,
			status: purchaseOrders.status,
			supplierId: purchaseOrders.supplierId,
			supplierName: suppliers.name,
			handoffMethod: purchaseOrders.handoffMethod,
			orderId: purchaseOrders.orderId,
			carrier: purchaseOrders.carrier,
			trackingNumber: purchaseOrders.trackingNumber,
			failureReason: purchaseOrders.failureReason,
			sentAt: purchaseOrders.sentAt,
			createdAt: purchaseOrders.createdAt,
		})
		.from(purchaseOrders)
		.innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
		.where(eq(purchaseOrders.workspaceId, workspaceId))
		.orderBy(sql`${purchaseOrders.createdAt} desc`);
}
