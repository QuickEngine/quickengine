import type { OutboxEvent, OutboxHandler } from "@quickengine/events";

/**
 * Remember the card, once the first payment has actually succeeded.
 *
 * ── Why a handler ────────────────────────────────────────────────────────────
 *
 * 🔴 A provider attaches the customer and the payment method when the charge
 * COMPLETES, not when it is created. Reading them at checkout captures nothing,
 * which is how a subscription ends up with no way to charge its second month —
 * and nothing on screen says so until a renewal quietly fails.
 *
 * ⚠️ Failing here must never roll back the payment. The customer has been
 * charged and their first box is real; a missing saved card is a subscription
 * that needs repairing, not a sale that should be undone.
 */
export function subscriptionPaymentMethodHandler(
	log: (message: string, detail: Record<string, unknown>) => void = () => {},
): OutboxHandler {
	return {
		name: "subscription-payment-method",
		async handle(event: OutboxEvent) {
			if (event.eventName !== "order.paid") return;
			const payload = event.payload as {
				orderId?: string;
				paymentId?: string;
			} | null;
			const orderId = payload?.orderId ?? event.aggregateId;
			if (!orderId || !payload?.paymentId) return;

			const { subscriptionForOrder, attachSubscriptionPaymentMethod } =
				await import("@quickengine/mod-orders");
			// Cheapest possible exit: most paid orders are not subscriptions, and
			// none of them should cost a provider round trip to find that out.
			if (!(await subscriptionForOrder(event.workspaceId, orderId))) return;

			const { db, eq, payments } = await import("@quickengine/db");
			const [payment] = await db
				.select({
					provider: payments.provider,
					externalPaymentId: payments.externalPaymentId,
					environment: payments.environment,
				})
				.from(payments)
				.where(eq(payments.id, payload.paymentId))
				.limit(1);
			if (!payment?.externalPaymentId) return;

			/**
			 * ⚠️ The connected account is on the WORKSPACE, not the payment. A
			 * provider call has to name the account the charge lives on, and
			 * `payments` records only the provider's own id for it.
			 */
			const { getPaymentAccount } = await import("@quickengine/mod-payments");
			const stored = await getPaymentAccount(event.workspaceId);
			if (!stored?.externalAccountId) return;

			const { getPaymentProvider } = await import("@quickengine/mod-payments");
			const provider = getPaymentProvider(payment.provider);
			// Optional on the seam: a provider with no stored methods cannot renew,
			// and saying nothing is better than pretending it can.
			if (!provider.readSavedMethod) return;

			const saved = await provider.readSavedMethod({
				environment: payment.environment === "test" ? "test" : "live",
				externalPaymentId: payment.externalPaymentId,
				connectedAccountId: stored.externalAccountId,
			});
			if (!saved) {
				log("subscription.no_saved_method", { eventId: event.id, orderId });
				return;
			}

			await attachSubscriptionPaymentMethod({
				workspaceId: event.workspaceId,
				orderId,
				...saved,
			});
			log("subscription.payment_method_saved", { eventId: event.id, orderId });
		},
	};
}
