import type { OutboxEvent, OutboxHandler } from "@quickengine/events";

/**
 * Put the goods back on the shelf when the customer's money goes back.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 Refunding reversed the money and left the stock count untouched. A refunded
 * item stayed sold as far as inventory was concerned, so a business slowly
 * undercounted what it could sell. Nothing looks broken while this happens —
 * the number stays entirely plausible, it is just quietly too low, and it never
 * corrects itself.
 *
 * ── Why a handler and not the refund transaction ─────────────────────────────
 *
 * The same reason the commission reversal is one: stock returning a second later
 * is fine, and a stock write failing must never roll back a refund the provider
 * has already sent. The customer's money is out the door either way; a count
 * that needs re-running is the recoverable half.
 *
 * ── Why only a FULL refund ───────────────────────────────────────────────────
 *
 * ⚠️ A refund is an AMOUNT, not a list of items. `$5.00 back on a $50 order`
 * names nothing that could be put on a shelf, and guessing which line it meant
 * would invent stock. So a partial refund restocks nothing, deliberately, and
 * an operator who wants stock back from one records the return by hand.
 */
export function refundRestockHandler(
	log: (message: string, detail: Record<string, unknown>) => void = () => {},
): OutboxHandler {
	return {
		name: "refund-restock",
		async handle(event: OutboxEvent) {
			if (event.eventName !== "payment.refunded") return;

			/**
			 * ⚠️ The operator's decision, carried on the event.
			 *
			 * False means the goods are not coming back: damaged in transit, lost by
			 * the carrier, or a goodwill refund where the customer keeps the item.
			 * Restocking those would invent stock that does not exist, which is how
			 * a business oversells and disappoints the NEXT customer.
			 */
			const payload = event.payload as { restock?: boolean } | null;
			if (payload?.restock === false) return;

			const { and, db, eq, payments } = await import("@quickengine/db");
			/**
			 * 🔴 Scoped to the EVENT'S workspace, not just the id.
			 *
			 * An outbox handler runs with no session. It is handed a workspace
			 * and a payload, and the payload is data — an id in it is a claim,
			 * not a fact. Looking a record up by id alone means a wrong or
			 * malicious id reaches across a tenant boundary, and there is no
			 * session for anything to refuse.
			 *
			 * Not reachable today: this id is written by the same authorized
			 * mutation that emitted the event. That is an argument for why it
			 * has not bitten, not for leaving it — the route layer already
			 * refuses this shape everywhere, and the jobs are the half nobody
			 * swept.
			 */
			const [payment] = await db
				.select({
					orderId: payments.orderId,
					status: payments.status,
				})
				.from(payments)
				.where(
					and(
						eq(payments.workspaceId, event.workspaceId),
						eq(payments.id, event.aggregateId),
					),
				)
				.limit(1);

			// A refund against an invoice with no order has no lines to restock.
			if (!payment?.orderId) return;
			// Bound to a local so the narrowing survives into the closure below.
			const orderId = payment.orderId;

			/**
			 * 🔴 `refunded` is the whole test for "fully refunded".
			 *
			 * `refundPaymentInTx` sets it only when the refunded total reaches the
			 * payment exactly, and leaves the payment `succeeded` otherwise. So this
			 * one field already carries the answer, and recomputing it here would be
			 * a second implementation of the same sum, free to disagree.
			 */
			if (payment.status !== "refunded") return;

			const { restockOrderStockInTx } = await import("@quickengine/mod-orders");
			await db.transaction(async (tx) => {
				await restockOrderStockInTx(tx, event.workspaceId, orderId, {
					note: "Returned to stock after refund",
				});
			});

			log("refund.restocked", {
				eventId: event.id,
				orderId,
			});
		},
	};
}
