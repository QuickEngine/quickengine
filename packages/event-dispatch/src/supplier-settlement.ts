import type { OutboxEvent, OutboxHandler } from "@quickengine/events";

/**
 * How the money actually moves.
 *
 * 🔑 Injected so the one thing that cannot be exercised honestly against a real
 * provider in a test suite has a seam. The default is the real Stripe transfer.
 */
export type SupplierTransferer = (input: {
	environment: "test" | "live";
	destinationAccountId: string;
	amountCents: number;
	currency: string;
	idempotencyKey: string;
	sourceTransactionId?: string | null;
	description: string;
	metadata: Record<string, string>;
}) => Promise<{ externalTransferId: string; amountCents: number }>;

/**
 * Paying the supplier the moment their obligation becomes real.
 *
 * ── Why this is a separate handler ───────────────────────────────────────────
 *
 * 🔴 Moving money and telling a supplier what to ship fail for different
 * reasons and want different retries. `supplier-handoff` is about a purchase
 * order reaching whoever fulfils it; this is about the money that purchase
 * order commits. Folding them together would mean a Shopify outage stalling a
 * transfer, and a short platform balance re-sending a supplier's order email.
 *
 * ── Where the money already is ───────────────────────────────────────────────
 *
 * 🔑 Nothing here collects anything. Checkout already held the supplier's share
 * back as the charge's `application_fee_amount`, so by the time this runs the
 * platform balance is holding exactly what the supplier is owed. This is the
 * step that sends it on, and QuickEngine nets zero from it.
 *
 * ⚠️ Registered AFTER `supplier-handoff` so the purchase orders it settles
 * already exist. Re-deriving them is safe: raising is idempotent and returns
 * the purchase orders that are already there.
 */
export function supplierSettlementHandler(
	log: (message: string, detail: Record<string, unknown>) => void = (
		message,
		detail,
	) => console.error(message, detail),
	transferer?: SupplierTransferer,
): OutboxHandler {
	return {
		name: "supplier-settlement",
		async handle(event: OutboxEvent) {
			// Cheapest possible rejection, before any database work.
			if (event.eventName !== "order.paid") return;

			const orderId =
				(event.payload as { orderId?: string } | null)?.orderId ??
				event.aggregateId;
			if (!orderId) return;

			// Lazily imported: nothing about DEFINING this handler needs the payment
			// or inventory module in the module graph of route registration.
			const [
				{
					raisePurchaseOrdersForOrder,
					recordSupplierObligation,
					settleSupplierPayment,
				},
				payments,
				{ db, eq, orders, quickengineWorkspaces, workspaceEnvironment },
			] = await Promise.all([
				import("@quickengine/mod-inventory"),
				import("@quickengine/mod-payments"),
				import("@quickengine/db"),
			]);
			const sendTransfer = transferer ?? payments.sendSupplierTransfer;

			const raised = await raisePurchaseOrdersForOrder({
				workspaceId: event.workspaceId,
				orderId,
			});
			if (raised.length === 0) return;

			const environment = await workspaceEnvironment(event.workspaceId);

			/**
			 * What the SUPPLIER reads against the money.
			 *
			 * 🔴 Names the BUSINESS and its order, never QuickEngine. The economic
			 * relationship is the business owing the supplier; the platform is only
			 * the mechanism. Stripe still shows its own Connect application name on
			 * the recipient side and that cannot be suppressed, which is exactly why
			 * this label has to say who the money is actually from.
			 */
			const [order] = await db
				.select({ number: orders.number })
				.from(orders)
				.where(eq(orders.id, orderId))
				.limit(1);
			const [workspace] = await db
				.select({ name: quickengineWorkspaces.name })
				.from(quickengineWorkspaces)
				.where(eq(quickengineWorkspaces.id, event.workspaceId))
				.limit(1);
			const businessName = workspace?.name ?? "Your order";
			const orderNumber = order?.number ?? orderId;

			let retryable = false;
			for (const purchaseOrder of raised) {
				try {
					const obligation = await recordSupplierObligation({
						workspaceId: event.workspaceId,
						purchaseOrderId: purchaseOrder.id,
						orderId,
						environment,
					});

					const outcome = await settleSupplierPayment(
						event.workspaceId,
						obligation.id,
						sendTransfer,
						{
							description: `${businessName} — Order ${orderNumber} supplier settlement`,
						},
					);

					if (!outcome.settled) {
						/**
						 * ⚠️ Only a RETRYABLE refusal earns a redelivery.
						 *
						 * A supplier who has not finished connecting their account, or a
						 * platform balance that has not caught up with the charge yet,
						 * both resolve on their own. An obligation already paid, or one
						 * with no agreed cost, never will — retrying those forever would
						 * bury the one an operator could actually fix.
						 */
						if (outcome.retryable) retryable = true;
						log("supplier-settlement.not_settled", {
							eventId: event.id,
							orderId,
							purchaseOrderId: purchaseOrder.id,
							reason: outcome.reason,
							retryable: outcome.retryable,
						});
					}
				} catch (error) {
					/**
					 * 🔴 Never rethrows straight out of the loop.
					 *
					 * One supplier being unpayable must not stop the others on the same
					 * order from being paid. The failure is recorded and the event is
					 * retried once every purchase order has had its turn.
					 */
					retryable = true;
					log("supplier-settlement.failed", {
						error,
						eventId: event.id,
						orderId,
						purchaseOrderId: purchaseOrder.id,
					});
				}
			}

			/**
			 * 🔴 NEVER THROWS, however retryable the refusal.
			 *
			 * This used to throw so the outbox would retry. That was wrong, and it
			 * caused real harm on 2026-08-28: the drain re-runs EVERY handler when
			 * any one of them fails, so a supplier who had not finished connecting
			 * their payout account made `order.paid` retry once a minute — and the
			 * customer was emailed their order confirmation again on every attempt.
			 * Four identical emails before it was stopped by hand.
			 *
			 * ⚠️ "Handlers must be idempotent" cannot save this. Sending an email is
			 * not idempotent — there is no un-send — so a handler that forces a
			 * retry is charging every other handler for its own incompleteness.
			 *
			 * 🔑 The obligation stays `calculated` and `settlePendingSupplierPayments`
			 * picks it up on its own schedule. That is a better retry anyway: it
			 * survives the outbox exhausting its eight attempts, and it settles a
			 * supplier who finishes onboarding days after the order was placed.
			 */
			if (retryable) {
				log("supplier-settlement.deferred", {
					eventId: event.id,
					orderId,
					note: "left calculated for the settlement sweep",
				});
			}
		},
	};
}
