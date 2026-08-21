import {
	and,
	apiAuditEvents,
	apiOutboxEvents,
	db,
	eq,
	orders,
} from "@quickengine/db";
import {
	markPurchaseOrderShippedInTx,
	recordPurchaseOrderShipmentFailureInTx,
} from "@quickengine/mod-inventory";
import { setOrderStatusInTx } from "@quickengine/mod-orders";
import { recordSupplierShipmentInTx } from "@quickengine/mod-shipping";

/**
 * The supplier-confirmed fulfilment commit.
 *
 * ── Why this lives here and not in a module ──────────────────────────────────
 *
 * It coordinates three modules that deliberately do not know about each other:
 * inventory owns the purchase order, orders owns the lifecycle, shipping owns
 * the shipment. Putting the coordination in any one of them would make it
 * depend on the other two. This is the same seat, and the same shape, as
 * `settlePaidCheckout` beside it — a verified provider event, one transaction,
 * everything or nothing.
 *
 * ── What commits together ────────────────────────────────────────────────────
 *
 * ```
 * purchase order -> shipped + tracking
 * order          -> walked forward to processing
 * shipment       -> created, lines only, marked shipped
 * fulfilment     -> in progress
 * audit + outbox -> shipment.created, shipment.status-changed
 * ```
 *
 * 🔴 The outbox event is what reaches the CUSTOMER. `shipment.status-changed`
 * with status `shipped` is the trigger `customer-notifications.ts` already
 * listens for, and it already sends carrier and tracking. That is the entire
 * payoff for building a real shipment rather than special-casing a dropship one:
 * the portal, the operator list and the customer's email all work with no new
 * notification code.
 */
export type SupplierShipmentOutcome =
	| {
			applied: true;
			purchaseOrderId: string;
			orderId: string | null;
			/** Null when tracking was recorded but no customer shipment could be built. */
			shipmentId: string | null;
	  }
	| {
			applied: false;
			reason:
				| "unknown"
				| "not-sent"
				| "already-shipped"
				| "order-not-shippable";
	  };

/** Statuses a shipment can still be created against, after walking forward. */
const WALK_TO_PROCESSING = ["placed", "confirmed"] as const;

export async function recordSupplierShipmentNotice(input: {
	workspaceId: string;
	supplierId: string;
	provider: string;
	/** The provider's event id. Becomes the audit request id. */
	eventId: string;
	externalOrderId: string;
	carrier?: string | null;
	trackingNumber?: string | null;
	trackingUrl?: string | null;
}): Promise<SupplierShipmentOutcome> {
	return db.transaction(async (tx) => {
		// 🔴 The claim first, and it is the duplicate defence. Everything below
		// only runs for the one caller that won it.
		const claimed = await markPurchaseOrderShippedInTx(tx, {
			workspaceId: input.workspaceId,
			supplierId: input.supplierId,
			externalOrderId: input.externalOrderId,
			carrier: input.carrier,
			trackingNumber: input.trackingNumber,
			trackingUrl: input.trackingUrl,
		});
		if (!claimed.applied) return claimed;

		const evidence = {
			workspaceId: input.workspaceId,
			actorType: "supplier",
			actorId: input.provider,
			requestId: input.eventId,
			source: "system",
		} as const;

		const noShipment = async (reason: string) => {
			await recordPurchaseOrderShipmentFailureInTx(tx, {
				workspaceId: input.workspaceId,
				purchaseOrderId: claimed.purchaseOrderId,
				reason,
			});
		};

		/**
		 * ⚠️ A purchase order with no customer order behind it, or whose order
		 * lines have since been deleted. The tracking is still recorded and true;
		 * there is simply nothing customer-facing to attach it to.
		 */
		if (!claimed.orderId || claimed.lines.length === 0) {
			await noShipment(
				"Supplier reported a shipment, but this purchase order has no customer order lines to ship.",
			);
			return {
				applied: true,
				purchaseOrderId: claimed.purchaseOrderId,
				orderId: claimed.orderId,
				shipmentId: null,
			};
		}

		const [order] = await tx
			.select({ status: orders.status })
			.from(orders)
			.where(
				and(
					eq(orders.workspaceId, input.workspaceId),
					eq(orders.id, claimed.orderId),
				),
			)
			.limit(1);

		/**
		 * 🔴 Cancelled, fulfilled, or never placed. A supplier has shipped goods
		 * against an order that cannot receive a shipment, which is a real problem
		 * and needs a person — so it is RECORDED rather than thrown away, and the
		 * purchase order keeps its `shipped` status because the supplier really did
		 * send it.
		 */
		if (
			!order ||
			(order.status !== "processing" &&
				!(WALK_TO_PROCESSING as readonly string[]).includes(order.status))
		) {
			await noShipment(
				`Supplier reported a shipment, but the order is ${order?.status ?? "missing"} and cannot receive one.`,
			);
			return { applied: false, reason: "order-not-shippable" };
		}

		/**
		 * Settlement leaves a paid order at `placed`, and a shipment demands
		 * `confirmed` or `processing`. Both hops go through the ordinary Orders
		 * transition rather than a direct UPDATE, so this obeys the same lifecycle
		 * as an operator action. Stock is reserved at `placed`, so neither hop
		 * double-reserves.
		 */
		if (order.status === "placed") {
			await setOrderStatusInTx(
				tx,
				input.workspaceId,
				claimed.orderId,
				"confirmed",
			);
		}
		if (order.status === "placed" || order.status === "confirmed") {
			await setOrderStatusInTx(
				tx,
				input.workspaceId,
				claimed.orderId,
				"processing",
			);
		}

		const shipment = await recordSupplierShipmentInTx(tx, input.workspaceId, {
			orderId: claimed.orderId,
			sourceModule: "purchase_orders",
			sourceRecordId: claimed.purchaseOrderId,
			lines: claimed.lines,
			carrier: input.carrier,
			trackingNumber: input.trackingNumber,
			trackingUrl: input.trackingUrl,
			metadata: { supplierProvider: input.provider },
		});

		/**
		 * ⚠️ Null means `fulfillments_source_unique` already had this purchase
		 * order. The database refused a second shipment, which is exactly its job
		 * on a redelivery that got past the status guard.
		 */
		if (!shipment) {
			return {
				applied: true,
				purchaseOrderId: claimed.purchaseOrderId,
				orderId: claimed.orderId,
				shipmentId: null,
			};
		}

		await tx.insert(apiAuditEvents).values([
			{
				...evidence,
				action: "purchase-order.shipped",
				resourceType: "purchase_order",
				resourceId: claimed.purchaseOrderId,
				metadata: { provider: input.provider, shipmentId: shipment.id },
			},
			{
				...evidence,
				action: "shipment.created",
				resourceType: "shipment",
				resourceId: shipment.id,
				metadata: { orderId: claimed.orderId, source: "supplier" },
			},
			{
				...evidence,
				action: "shipment.status-changed",
				resourceType: "shipment",
				resourceId: shipment.id,
				metadata: { status: "shipped" },
			},
		]);

		await tx.insert(apiOutboxEvents).values([
			{
				...evidence,
				aggregateType: "shipment",
				aggregateId: shipment.id,
				eventName: "shipment.created",
				payload: { orderId: claimed.orderId, shipmentId: shipment.id },
				version: 1,
			},
			{
				// 🔴 This one reaches the customer. See the note at the top.
				...evidence,
				aggregateType: "shipment",
				aggregateId: shipment.id,
				eventName: "shipment.status-changed",
				payload: { shipmentId: shipment.id, status: "shipped" },
				version: 1,
			},
		]);

		return {
			applied: true,
			purchaseOrderId: claimed.purchaseOrderId,
			orderId: claimed.orderId,
			shipmentId: shipment.id,
		};
	});
}
