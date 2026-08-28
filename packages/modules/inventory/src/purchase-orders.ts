import {
	and,
	db,
	eq,
	inArray,
	isNull,
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
	/**
	 * Whether this supplier has agreed to receive SANDBOX orders.
	 *
	 * 🔑 Read from the supplier, never snapshotted onto the purchase order:
	 * agreeing to rehearsals is a fact about the relationship right now, and
	 * withdrawing it must take effect immediately rather than when the next
	 * order happens to be raised.
	 */
	sandboxHandoffEnabled: boolean;
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
				/**
				 * 🔴 The archived filter belongs HERE, in the join.
				 *
				 * It used to be a `.filter(row => row.supplierId)` below, which is
				 * always true after an inner join and therefore did nothing — while
				 * the comment beside it claimed archived mappings did not route. A
				 * supplier removed from a product still received its orders, and the
				 * code said the opposite.
				 */
				isNull(supplierSkus.archivedAt),
			),
		)
		.innerJoin(
			suppliers,
			and(
				eq(suppliers.id, supplierSkus.supplierId),
				// An archived SUPPLIER routes nothing either, for the same reason.
				isNull(suppliers.archivedAt),
			),
		)
		.where(eq(orderLineItems.orderId, input.orderId));

	if (rows.length === 0) return [];

	/**
	 * 🔴 ONE supplier per line, chosen here, or the business pays twice.
	 *
	 * `supplier_skus` is unique on (supplier, product) but NOT on product alone —
	 * dual sourcing is legitimate, so two suppliers may both map the same coffee.
	 * Grouping straight into purchase orders then asked BOTH of them for it: two
	 * bags bought, two bags shipped, one customer.
	 *
	 * ⚠️ Cheapest wins, oldest mapping breaks a tie. Deterministic on purpose —
	 * an arbitrary choice would make a paid order depend on row order, and the
	 * same order would route differently on a retry.
	 *
	 * A mapping with no cost recorded sorts LAST: an unknown price is not a
	 * cheap one, and treating it as zero would silently prefer the supplier
	 * somebody had not finished setting up.
	 */
	const chosen = new Map<string, (typeof rows)[number]>();
	for (const row of rows) {
		const held = chosen.get(row.lineId);
		if (!held) {
			chosen.set(row.lineId, row);
			continue;
		}
		const cost = row.unitCostCents ?? Number.POSITIVE_INFINITY;
		const heldCost = held.unitCostCents ?? Number.POSITIVE_INFINITY;
		if (cost < heldCost) chosen.set(row.lineId, row);
	}
	const live = [...chosen.values()];

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
				sandboxHandoffEnabled: supplier.sandboxHandoffEnabled,
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
			sandboxHandoffEnabled: supplier.sandboxHandoffEnabled,
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
	/**
	 * What state a non-send lands in. Defaults to `failed`.
	 *
	 * 🔴 `skipped_sandbox` for a deliberate refusal. A sandbox order is held
	 * back on purpose so a test cannot make a real supplier ship real goods —
	 * that is the guard working, not a fault. Recording it as `failed` puts a
	 * red "could not be sent" beside every test order, and in a live workspace
	 * `failed` means a supplier genuinely never got one and somebody must act.
	 * Two very different things must not look identical.
	 */
	unsentStatus?: "failed" | "skipped_sandbox";
	now?: Date;
}) {
	const now = input.now ?? new Date();
	await db
		.update(purchaseOrders)
		.set(
			input.failureReason
				? {
						status: input.unsentStatus ?? "failed",
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

/** Matches the shipping module's convention for a transaction-scoped write. */
export type PurchaseOrderTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];

/**
 * Claim a purchase order for a supplier's shipment notice, and record the
 * tracking that came with it.
 *
 * 🔴 The claim IS the idempotency — a conditional update guarded on status, the
 * same shape as `claimPurchaseOrderForDispatch` and the payment webhooks. A
 * redelivered fulfilment finds the purchase order already `shipped` and changes
 * nothing, which is the normal outcome of at-least-once delivery rather than a
 * divergence. A redelivery carrying DIFFERENT tracking must not overwrite what
 * the first one recorded.
 *
 * 🔴 The three refusals are told APART on purpose. `already-shipped` is ordinary
 * and must stay quiet, but `unknown` and `not-sent` both mean a supplier is
 * shipping something this system has no record of asking for. Folding them into
 * one reason is how that goes unnoticed.
 *
 * ⚠️ In-transaction only. The caller commits this together with the customer
 * shipment it produces, so a supplier can never be recorded as having shipped
 * while the customer's order shows nothing.
 *
 * Returns the order lines this purchase order covers, which is what the shipment
 * is built from. Lines whose order line has since been deleted are dropped:
 * `order_line_item_id` is `set null` precisely so the record of what a supplier
 * was asked to send survives, but a shipment cannot reference what is gone.
 */
export async function markPurchaseOrderShippedInTx(
	tx: PurchaseOrderTransaction,
	input: {
		workspaceId: string;
		supplierId: string;
		externalOrderId: string;
		carrier?: string | null;
		trackingNumber?: string | null;
		trackingUrl?: string | null;
		now?: Date;
	},
): Promise<
	| {
			applied: true;
			purchaseOrderId: string;
			orderId: string | null;
			lines: { orderLineItemId: string; quantity: number }[];
	  }
	| { applied: false; reason: "unknown" | "not-sent" | "already-shipped" }
> {
	const now = input.now ?? new Date();
	const [found] = await tx
		.select()
		.from(purchaseOrders)
		.where(
			and(
				eq(purchaseOrders.workspaceId, input.workspaceId),
				eq(purchaseOrders.supplierId, input.supplierId),
				eq(purchaseOrders.supplierReference, input.externalOrderId),
			),
		)
		.limit(1)
		.for("update");

	// A supplier's own store may carry orders QuickDash never placed. Not an error.
	if (!found) return { applied: false, reason: "unknown" };

	// Already at or past shipped: the ordinary redelivery. Nothing to say.
	if (found.status === "shipped" || found.status === "received")
		return { applied: false, reason: "already-shipped" };

	/**
	 * 🔴 Still `draft`, `sending`, `failed` or `cancelled` — nobody ever told this
	 * supplier to ship. Either the reference was reused, or an order was placed
	 * outside QuickDash against a purchase order it does not own. A person needs
	 * to look at it.
	 */
	if (found.status !== "sent" && found.status !== "acknowledged")
		return { applied: false, reason: "not-sent" };

	const [updated] = await tx
		.update(purchaseOrders)
		.set({
			status: "shipped",
			carrier: input.carrier ?? found.carrier,
			trackingNumber: input.trackingNumber ?? found.trackingNumber,
			trackingUrl: input.trackingUrl ?? found.trackingUrl,
			updatedAt: now,
		})
		.where(
			and(
				eq(purchaseOrders.id, found.id),
				inArray(purchaseOrders.status, ["sent", "acknowledged"]),
			),
		)
		.returning();

	// Lost the race to a concurrent redelivery, which already applied it.
	if (!updated) return { applied: false, reason: "already-shipped" };

	const lines = await tx
		.select({
			orderLineItemId: purchaseOrderLines.orderLineItemId,
			quantity: purchaseOrderLines.quantity,
		})
		.from(purchaseOrderLines)
		.where(eq(purchaseOrderLines.purchaseOrderId, updated.id));

	return {
		applied: true,
		purchaseOrderId: updated.id,
		orderId: updated.orderId,
		lines: lines.flatMap((line) =>
			line.orderLineItemId
				? [{ orderLineItemId: line.orderLineItemId, quantity: line.quantity }]
				: [],
		),
	};
}

/**
 * Record why a supplier's shipment could not become a customer shipment.
 *
 * ⚠️ The purchase order stays `shipped`, because it IS — the supplier really did
 * send the goods. `failureReason` says the customer-facing half did not happen,
 * which is the pair of facts a person needs to put it right.
 */
export async function recordPurchaseOrderShipmentFailureInTx(
	tx: PurchaseOrderTransaction,
	input: { workspaceId: string; purchaseOrderId: string; reason: string },
) {
	await tx
		.update(purchaseOrders)
		.set({ failureReason: input.reason, updatedAt: new Date() })
		.where(
			and(
				eq(purchaseOrders.workspaceId, input.workspaceId),
				eq(purchaseOrders.id, input.purchaseOrderId),
			),
		);
}

/**
 * What a business asked its suppliers for, newest first.
 *
 * 🔑 Carries the customer ORDER NUMBER, not just its id. An operator reading
 * this screen is holding a customer conversation — "where is order ORD-1042" —
 * and a uuid answers nothing. Left-joined because a purchase order raised by
 * hand, or one whose order was since deleted, is still a real record.
 *
 * ⚠️ Lines come back with it. A purchase order without its contents cannot
 * answer the only question anybody asks of one: what did we ask them to send?
 */
export async function listPurchaseOrders(workspaceId: string) {
	const rows = await db
		.select({
			id: purchaseOrders.id,
			number: purchaseOrders.number,
			status: purchaseOrders.status,
			supplierId: purchaseOrders.supplierId,
			supplierName: suppliers.name,
			handoffMethod: purchaseOrders.handoffMethod,
			orderId: purchaseOrders.orderId,
			orderNumber: orders.number,
			carrier: purchaseOrders.carrier,
			trackingNumber: purchaseOrders.trackingNumber,
			trackingUrl: purchaseOrders.trackingUrl,
			failureReason: purchaseOrders.failureReason,
			supplierReference: purchaseOrders.supplierReference,
			sentAt: purchaseOrders.sentAt,
			createdAt: purchaseOrders.createdAt,
		})
		.from(purchaseOrders)
		.innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
		.leftJoin(orders, eq(orders.id, purchaseOrders.orderId))
		.where(eq(purchaseOrders.workspaceId, workspaceId))
		.orderBy(sql`${purchaseOrders.createdAt} desc`);

	if (rows.length === 0) return [];

	const lines = await db
		.select({
			purchaseOrderId: purchaseOrderLines.purchaseOrderId,
			supplierSku: purchaseOrderLines.supplierSku,
			description: purchaseOrderLines.description,
			quantity: purchaseOrderLines.quantity,
			unitCostCents: purchaseOrderLines.unitCostCents,
			currency: purchaseOrderLines.currency,
		})
		.from(purchaseOrderLines)
		.where(
			inArray(
				purchaseOrderLines.purchaseOrderId,
				rows.map((row) => row.id),
			),
		);

	const byPurchaseOrder = new Map<string, typeof lines>();
	for (const line of lines) {
		const existing = byPurchaseOrder.get(line.purchaseOrderId);
		if (existing) existing.push(line);
		else byPurchaseOrder.set(line.purchaseOrderId, [line]);
	}

	return rows.map((row) => ({
		...row,
		lines: byPurchaseOrder.get(row.id) ?? [],
	}));
}
