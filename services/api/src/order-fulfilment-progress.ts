import type { MutationExecutionContext } from "@quickengine/api-contracts/mutations";
import { getOrderDto, setOrderStatusCommand } from "@quickengine/mod-orders";
import { shippedQuantitiesForOrder } from "@quickengine/mod-shipping";
import type { ApiLogger } from "./logger";

/**
 * Keeping an order's status honest about its own parcels.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 The order lifecycle and the shipment lifecycle were two state machines that
 * never spoke. An operator could create a shipment and the order stayed
 * `confirmed`; could mark an order `fulfilled` with no shipment at all, or with
 * a `draft` one that never left the building. So `processing` and `fulfilled`
 * recorded what somebody REMEMBERED TO CLICK rather than what happened, which is
 * fine for three orders a week and is how an order gets marked fulfilled and
 * never posted at any real volume.
 *
 * ── Why it lives in the API and not in a module ───────────────────────────────
 *
 * Modules do not import each other; the API is where orders and shipping are
 * already composed. This is the same shape as `completeReferralsForOrder` on the
 * connect webhook, and it is deliberately BEST EFFORT for the same reason: the
 * parcel is the real thing that happened. Refusing the write because a derived
 * status could not be updated would lose the shipment to save a label.
 */

type Deps = {
	logger: ApiLogger;
	requestId: string;
	/**
	 * 🔴 Takes an explicit idempotency key. The route's own key comes from the
	 * request header and is therefore SHARED by every mutation in that request —
	 * so advancing an order twice in one request had the second call treated as a
	 * replay of the first and silently skipped. Derived rather than random, so a
	 * retried request replays correctly instead of advancing twice.
	 */
	mutationContext: (
		action: string,
		payload: Record<string, unknown>,
		idempotencyKey: string,
	) => Promise<MutationExecutionContext>;
	/** The request's own key, which derived keys are suffixed from. */
	idempotencyKey: string;
	uow?: unknown;
};

/** Statuses from which shipping is allowed, per the orders state machine. */
const SHIPPABLE = new Set(["confirmed", "processing"]);

async function advance(
	workspaceId: string,
	orderId: string,
	to: "processing" | "fulfilled",
	deps: Deps,
) {
	const context = await deps.mutationContext(
		"orders.set-status",
		{ id: orderId, status: to },
		`${deps.idempotencyKey}:order-progress:${to}`,
	);
	await setOrderStatusCommand(
		context,
		orderId,
		to,
		deps.uow as Parameters<typeof setOrderStatusCommand>[3],
	);
	deps.logger.info("order.progress.advanced", {
		orderId,
		requestId: deps.requestId,
		status: to,
		workspaceId,
	});
}

/**
 * A parcel exists, so the order is being worked on.
 *
 * Only from `confirmed`: `processing` is the next legal step and moving from
 * anywhere else would either be a no-op the server rejects or a jump the
 * operator did not ask for.
 */
export async function onShipmentCreated(
	workspaceId: string,
	orderId: string,
	deps: Deps,
) {
	try {
		const order = await getOrderDto(workspaceId, orderId);
		if (order?.status !== "confirmed") return;
		await advance(workspaceId, orderId, "processing", deps);
	} catch (error) {
		// The shipment is real either way. See the note at the top.
		deps.logger.error("order.progress.create_failed", {
			error,
			orderId,
			requestId: deps.requestId,
		});
	}
}

/**
 * A parcel left. If nothing is still owed, the order is done.
 *
 * ⚠️ Decided by what is OUTSTANDING, never by counting shipments. A partial
 * shipment leaving would otherwise fulfil an order that still owes half its
 * contents — and `shippedQuantitiesForOrder` already discounts cancelled
 * shipments, so a cancelled parcel correctly makes the goods owed again.
 */
export async function onShipmentDispatched(
	workspaceId: string,
	orderId: string,
	shipmentStatus: string,
	deps: Deps,
) {
	if (!["shipped", "in_transit", "delivered"].includes(shipmentStatus)) return;
	try {
		const order = await getOrderDto(workspaceId, orderId);
		if (!order || !SHIPPABLE.has(order.status)) return;

		const shipped = await shippedQuantitiesForOrder(workspaceId, orderId);
		const outstanding = order.lineItems.some(
			(line) => line.quantity - (shipped[line.id] ?? 0) > 0,
		);
		if (outstanding) return;

		// `fulfilled` is only reachable from `processing`, so an order still sitting
		// at `confirmed` has to pass through it.
		if (order.status === "confirmed") {
			await advance(workspaceId, orderId, "processing", deps);
		}
		await advance(workspaceId, orderId, "fulfilled", deps);
	} catch (error) {
		deps.logger.error("order.progress.dispatch_failed", {
			error,
			orderId,
			requestId: deps.requestId,
		});
	}
}
