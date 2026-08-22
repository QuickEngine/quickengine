import {
	and,
	eq,
	inventoryAdjustments,
	inventoryItems,
	isNull,
	orderLineItems,
	sql,
	workspaceModules,
} from "@quickengine/db";
import {
	applyInventoryAdjustmentInTx,
	inventorySettingsSchema,
} from "@quickengine/mod-inventory";
import type { OrderTransaction } from "./orders";

/**
 * Stock movement driven by the order lifecycle.
 *
 * Orders and inventory are deliberately **not** coupled in the module graph:
 * `orders.dependsOn` does not list `inventory`, because plenty of businesses sell
 * things they do not track stock for. This file imports inventory's code, which is
 * a compile-time dependency, and then checks at run time whether the workspace has
 * the module enabled. **Do not "fix" the manifest by adding inventory to
 * `dependsOn`** — that would force stock tracking on every workspace that sells
 * anything.
 *
 * The same tolerance applies one level down: a workspace can have inventory enabled
 * and still not track a particular product. A line with no `inventory_items` row is
 * untracked and is skipped, not failed.
 *
 * **Where the movements happen**, decided with Asher 2026-07-26:
 *
 * | Order event | Movement | Why |
 * |---|---|---|
 * | `placed` | `reserve` | The customer has committed. This is the window where two buyers can otherwise claim the last unit |
 * | `cancelled` | `release` | Give the stock back |
 * | shipment ships / order fulfilled | `fulfill_reserved` | The goods physically leave |
 *
 * Reserving at `placed` rather than `confirmed` is the whole point: the gap between
 * a customer paying and an operator confirming is exactly where overselling happens.
 */

/** Line types that consume physical stock. Digital, service, and package do not. */
const STOCKED_TYPES = new Set(["physical", "rental"]);

/**
 * Whether this workspace tracks stock, and under which policy.
 *
 * The engine answers "what is the balance"; the workspace's settings answer "is this
 * operation allowed". Keeping those separate is what lets a retailer refuse
 * overselling while a distributor deliberately runs negative for backorders, without
 * either behaviour being baked into the inventory engine.
 */
async function inventoryPolicy(
	tx: OrderTransaction,
	workspaceId: string,
): Promise<{ enabled: boolean; allowNegativeStock: boolean }> {
	const [module] = await tx
		.select({
			enabled: workspaceModules.enabled,
			settings: workspaceModules.settings,
		})
		.from(workspaceModules)
		.where(
			and(
				eq(workspaceModules.workspaceId, workspaceId),
				eq(workspaceModules.moduleId, "inventory"),
			),
		)
		.limit(1);
	if (!module?.enabled) return { enabled: false, allowNegativeStock: false };

	// Settings are validated on write, but a row predating a schema change can still
	// be incomplete. Parsing with defaults keeps a missing key from throwing here and
	// failing an order for an unrelated reason.
	const parsed = inventorySettingsSchema.safeParse(module.settings ?? {});
	return {
		enabled: true,
		allowNegativeStock: parsed.success ? parsed.data.allowNegativeStock : false,
	};
}

type StockedLine = {
	lineId: string;
	inventoryItemId: string;
	quantity: number;
};

/**
 * The order's lines that map to a tracked inventory item.
 *
 * A line points at a catalog item and optionally a variant. Inventory is keyed the
 * same way — one row per variant where variants exist, otherwise one per base item —
 * so the join is exact. Lines with no matching row are untracked and drop out here
 * rather than being treated as an error.
 */
async function stockedLines(
	tx: OrderTransaction,
	workspaceId: string,
	orderId: string,
): Promise<StockedLine[]> {
	const lines = await tx
		.select({
			lineId: orderLineItems.id,
			type: orderLineItems.type,
			quantity: orderLineItems.quantity,
			catalogItemId: orderLineItems.catalogItemId,
			catalogItemVariantId: orderLineItems.catalogItemVariantId,
		})
		.from(orderLineItems)
		.where(eq(orderLineItems.orderId, orderId));

	const stocked: StockedLine[] = [];
	for (const line of lines) {
		if (!STOCKED_TYPES.has(line.type) || !line.catalogItemId) continue;
		if (line.quantity <= 0) continue;

		const [item] = await tx
			.select({ id: inventoryItems.id })
			.from(inventoryItems)
			.where(
				and(
					eq(inventoryItems.workspaceId, workspaceId),
					line.catalogItemVariantId
						? eq(inventoryItems.catalogItemVariantId, line.catalogItemVariantId)
						: and(
								eq(inventoryItems.catalogItemId, line.catalogItemId),
								isNull(inventoryItems.catalogItemVariantId),
							),
				),
			)
			.limit(1);
		if (!item) continue;
		stocked.push({
			lineId: line.lineId,
			inventoryItemId: item.id,
			quantity: line.quantity,
		});
	}
	return stocked;
}

/**
 * A stable key per line and movement.
 *
 * `inventory_adjustments` enforces uniqueness on this, and
 * `applyInventoryAdjustmentInTx` returns the existing row when it matches. That is
 * what makes a retried order transition — or a redelivered provider webhook that
 * drives one — a no-op rather than a second reservation.
 */
const movementKey = (orderId: string, lineId: string, movement: string) =>
	`order:${orderId}:line:${lineId}:${movement}`;

/** Hold stock for every tracked line. Called when an order is placed. */
export async function reserveOrderStockInTx(
	tx: OrderTransaction,
	workspaceId: string,
	orderId: string,
): Promise<void> {
	const policy = await inventoryPolicy(tx, workspaceId);
	if (!policy.enabled) return;

	for (const line of await stockedLines(tx, workspaceId, orderId)) {
		await applyInventoryAdjustmentInTx(
			tx,
			workspaceId,
			line.inventoryItemId,
			{
				kind: "reserve",
				quantity: line.quantity,
				referenceId: orderId,
				idempotencyKey: movementKey(orderId, line.lineId, "reserve"),
				note: "Reserved for order",
			},
			{ allowNegativeStock: policy.allowNegativeStock },
		);
	}
}

/**
 * How much of this order's reservation is still outstanding for one line.
 *
 * Releasing the full line quantity would be wrong once part of an order has already
 * shipped: `fulfill_reserved` has already taken that quantity out of `reserved`, and
 * releasing it again would drive the balance negative and throw. Summing this
 * order's own movements gives the amount genuinely still held.
 */
async function outstandingReservation(
	tx: OrderTransaction,
	workspaceId: string,
	orderId: string,
	inventoryItemId: string,
): Promise<number> {
	const [totals] = await tx
		.select({
			held: sql<number>`coalesce(sum(${inventoryAdjustments.reservedDelta}), 0)::int`,
		})
		.from(inventoryAdjustments)
		.where(
			and(
				eq(inventoryAdjustments.workspaceId, workspaceId),
				eq(inventoryAdjustments.referenceId, orderId),
				eq(inventoryAdjustments.inventoryItemId, inventoryItemId),
			),
		);
	return Math.max(0, Number(totals?.held ?? 0));
}

/** Give stock back. Called when an order is cancelled. */
export async function releaseOrderStockInTx(
	tx: OrderTransaction,
	workspaceId: string,
	orderId: string,
): Promise<void> {
	const policy = await inventoryPolicy(tx, workspaceId);
	if (!policy.enabled) return;

	for (const line of await stockedLines(tx, workspaceId, orderId)) {
		const held = await outstandingReservation(
			tx,
			workspaceId,
			orderId,
			line.inventoryItemId,
		);
		if (held <= 0) continue;
		await applyInventoryAdjustmentInTx(
			tx,
			workspaceId,
			line.inventoryItemId,
			{
				kind: "release",
				quantity: Math.min(held, line.quantity),
				referenceId: orderId,
				idempotencyKey: movementKey(orderId, line.lineId, "release"),
				note: "Released after order cancellation",
			},
			{ allowNegativeStock: policy.allowNegativeStock },
		);
	}
}

/**
 * Take the goods off the shelf: `onHand` and `reserved` both drop.
 *
 * Skips anything this order no longer holds, so an order that was partly shipped and
 * then completed does not consume the same units twice.
 */
export async function consumeOrderStockInTx(
	tx: OrderTransaction,
	workspaceId: string,
	orderId: string,
): Promise<void> {
	const policy = await inventoryPolicy(tx, workspaceId);
	if (!policy.enabled) return;

	for (const line of await stockedLines(tx, workspaceId, orderId)) {
		const held = await outstandingReservation(
			tx,
			workspaceId,
			orderId,
			line.inventoryItemId,
		);
		if (held <= 0) continue;
		await applyInventoryAdjustmentInTx(
			tx,
			workspaceId,
			line.inventoryItemId,
			{
				kind: "fulfill_reserved",
				quantity: Math.min(held, line.quantity),
				referenceId: orderId,
				idempotencyKey: movementKey(orderId, line.lineId, "fulfill"),
				note: "Shipped against order",
			},
			{ allowNegativeStock: policy.allowNegativeStock },
		);
	}
}

/**
 * How much stock this order has actually taken off the shelf.
 *
 * Summing `onHandDelta` is the whole trick: `reserve` and `release` do not touch
 * it, `fulfill_reserved` takes it, and a `customer_return` written by the restock
 * below gives it back. So this reads zero once an order has been restocked, which
 * is what makes restocking twice a no-op WITHOUT relying on the idempotency key —
 * the balance itself remembers.
 */
async function consumedQuantity(
	tx: OrderTransaction,
	workspaceId: string,
	orderId: string,
	inventoryItemId: string,
): Promise<number> {
	const [totals] = await tx
		.select({
			taken: sql<number>`coalesce(sum(${inventoryAdjustments.onHandDelta}), 0)::int`,
		})
		.from(inventoryAdjustments)
		.where(
			and(
				eq(inventoryAdjustments.workspaceId, workspaceId),
				eq(inventoryAdjustments.referenceId, orderId),
				eq(inventoryAdjustments.inventoryItemId, inventoryItemId),
			),
		);
	return Math.max(0, -Number(totals?.taken ?? 0));
}

/**
 * Put an order's stock back after the customer's money has been returned.
 *
 * 🔴 Refunding reversed the money and left the count alone until 2026-08-21, so a
 * refunded item stayed sold as far as stock was concerned and the business
 * undercounted what it could sell. Nobody noticed because the number stays
 * plausible — it is just quietly too low, forever.
 *
 * ⚠️ The two states are genuinely different and both happen:
 *
 * - The order was placed but never shipped, so stock is still RESERVED. Nothing
 *   left the shelf; the hold is simply given back (`release`).
 * - The order shipped, so stock was CONSUMED. The goods are coming back to the
 *   business, which is a `customer_return` and puts `onHand` up.
 *
 * Treating the second as a release would drive `reserved` negative and throw;
 * treating the first as a return would invent stock that never left.
 *
 * ⚠️ Caller decides WHETHER to restock. A refund for something damaged in transit
 * must not put it back on the shelf as sellable, and a system that always
 * restocks is as wrong as one that never does.
 */
export async function restockOrderStockInTx(
	tx: OrderTransaction,
	workspaceId: string,
	orderId: string,
	options: { note?: string } = {},
): Promise<void> {
	const policy = await inventoryPolicy(tx, workspaceId);
	if (!policy.enabled) return;

	const note = options.note ?? "Returned to stock after refund";
	for (const line of await stockedLines(tx, workspaceId, orderId)) {
		const held = await outstandingReservation(
			tx,
			workspaceId,
			orderId,
			line.inventoryItemId,
		);
		if (held > 0) {
			await applyInventoryAdjustmentInTx(
				tx,
				workspaceId,
				line.inventoryItemId,
				{
					kind: "release",
					quantity: Math.min(held, line.quantity),
					referenceId: orderId,
					idempotencyKey: movementKey(orderId, line.lineId, "refund-release"),
					note,
				},
				{ allowNegativeStock: policy.allowNegativeStock },
			);
		}

		const taken = await consumedQuantity(
			tx,
			workspaceId,
			orderId,
			line.inventoryItemId,
		);
		if (taken <= 0) continue;
		await applyInventoryAdjustmentInTx(
			tx,
			workspaceId,
			line.inventoryItemId,
			{
				kind: "customer_return",
				quantity: Math.min(taken, line.quantity),
				referenceId: orderId,
				idempotencyKey: movementKey(orderId, line.lineId, "refund-return"),
				note,
			},
			{ allowNegativeStock: policy.allowNegativeStock },
		);
	}
}
