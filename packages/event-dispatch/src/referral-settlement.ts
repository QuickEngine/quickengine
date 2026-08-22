import type { OutboxEvent, OutboxHandler } from "@quickengine/events";

/**
 * Pay the person who brought the customer, when the order actually settles.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 It did not, and that was the whole defect. `completeReferralsForOrder` and
 * `cancelReferralsForOrder` were written, tested, and had ZERO production
 * callers. A referral was recorded at checkout as `pending` and stayed pending
 * for ever: `referral_codes.total_earned_cents` never moved, and a partner told
 * they earn 15% earned nothing, silently, on every order they ever sent.
 *
 * The arithmetic was right. The recording was right. Nothing paid.
 *
 * ── Why a handler and not the settlement transaction ─────────────────────────
 *
 * A commission is not part of taking the customer's money. Failing to credit a
 * partner must never roll back a payment that Stripe has already captured —
 * the customer would be charged with no order to show for it, which is a far
 * worse outcome than a commission that needs re-running.
 *
 * ⚠️ Both directions are safe to repeat. Settling filters on `pending`, so a
 * redelivery updates nothing; cancelling reads the row's status BEFORE writing,
 * so a credit is reversed exactly once. At-least-once delivery guarantees this
 * will happen.
 */
export function referralSettlementHandler(
	log: (message: string, detail: Record<string, unknown>) => void = () => {},
): OutboxHandler {
	return {
		name: "referral-settlement",
		async handle(event: OutboxEvent) {
			const settles = event.eventName === "order.paid";
			/**
			 * 🔴 A refund takes the commission back with it.
			 *
			 * Otherwise a business refunds a customer and still owes a partner for
			 * a sale that no longer exists — and the partner has already been told
			 * they earned it.
			 */
			const cancels =
				event.eventName === "payment.refunded" ||
				(event.eventName === "order.status-changed" &&
					(event.payload as { status?: string } | null)?.status ===
						"cancelled");

			if (!settles && !cancels) return;

			/**
			 * 🔴 A refund event is about a PAYMENT, not an order.
			 *
			 * Its payload carries `{ paymentId, refundId }` and its aggregate id is
			 * the payment. Falling back to the aggregate would have looked up
			 * referrals by a payment id, matched nothing, and reversed nothing — a
			 * silent no-op, which is exactly the failure this handler exists to end.
			 */
			let orderId = (event.payload as { orderId?: string } | null)?.orderId;
			if (!orderId && event.aggregateType === "payment") {
				const { db, eq, payments } = await import("@quickengine/db");
				const [payment] = await db
					.select({ orderId: payments.orderId })
					.from(payments)
					.where(eq(payments.id, event.aggregateId))
					.limit(1);
				orderId = payment?.orderId ?? undefined;
			}
			orderId ??=
				event.aggregateType === "order" ? event.aggregateId : undefined;
			if (!orderId) return;

			const { cancelReferralsForOrder, completeReferralsForOrder } =
				await import("@quickengine/mod-orders");

			const affected = settles
				? await completeReferralsForOrder({
						workspaceId: event.workspaceId,
						orderId,
					})
				: await cancelReferralsForOrder({
						workspaceId: event.workspaceId,
						orderId,
					});

			if (affected > 0) {
				log(settles ? "referral.settled" : "referral.cancelled", {
					eventId: event.id,
					orderId,
					affected,
				});
			}
		},
	};
}
