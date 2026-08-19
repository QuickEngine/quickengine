import {
	claimNextCycle,
	createOrder,
	dueSubscriptions,
	priceCheckout,
	SubscriptionError,
	settleCycle,
} from "@quickengine/mod-orders";

/**
 * Turn due subscriptions into real orders.
 *
 * ── Why this is a cron and not an event handler ──────────────────────────────
 *
 * Nothing HAPPENS when a subscription falls due — the passage of time is not an
 * event anybody emits. So the only durable trigger is the clock, and the
 * database is the record of what is owed. A missed run is recovered by the next
 * one, because `dueSubscriptions` asks for everything overdue rather than
 * everything due exactly now.
 *
 * 🔴 Safety comes from `claimNextCycle`, not from this loop. Claiming inserts a
 * cycle row keyed on `(subscription_id, period_start)`, which is unique — so two
 * overlapping runs cannot both charge the same month. That is what makes it
 * acceptable to run every minute and to retry freely.
 *
 * ⚠️ One failure never stops the batch. A subscription whose catalog item was
 * deleted must not prevent every other business's renewals from going out.
 */
export async function renewDueSubscriptions(): Promise<{
	claimed: number;
	ordered: number;
	failed: number;
}> {
	const due = await dueSubscriptions();
	let claimed = 0;
	let ordered = 0;
	let failed = 0;

	for (const subscription of due) {
		const cycle = await claimNextCycle(subscription.id);
		// Another run got there first, or the plan vanished. Both are fine.
		if (!cycle) continue;
		claimed += 1;

		try {
			if (cycle.contents.length === 0) {
				throw new SubscriptionError("SUBSCRIPTION_PLAN_EMPTY");
			}
			/**
			 * 🔴 Priced NOW, from the catalog, not from the plan's stored price.
			 *
			 * The plan price governs the agreement; the order records what was
			 * actually sent this month. Reusing a price captured at signup would
			 * mean a box whose contents changed silently charging last year's
			 * amount — and `createOrder` requires real per-line prices anyway,
			 * because an order is a financial record, not a reference.
			 */
			const priced = await priceCheckout(
				subscription.workspaceId,
				cycle.contents.map(
					(line: { catalogItemId: string; quantity: number }) => ({
						catalogItemId: line.catalogItemId,
						quantity: line.quantity,
					}),
				),
			);
			const order = await createOrder(subscription.workspaceId, {
				clientId: cycle.subscription.customerId,
				currency: priced.currency,
				lines: priced.lines,
			});
			await settleCycle({
				subscriptionId: subscription.id,
				periodStart: cycle.periodStart,
				orderId: order.id,
			});
			ordered += 1;
		} catch (error) {
			/**
			 * 🔴 Recorded against the CYCLE, never thrown away.
			 *
			 * A renewal that failed silently is a customer who stops receiving
			 * coffee and a business that never finds out. The reason is stored for
			 * the operator; `settleCycle` decides whether this counts as past due
			 * or as the end of the subscription.
			 */
			await settleCycle({
				subscriptionId: subscription.id,
				periodStart: cycle.periodStart,
				failureReason:
					error instanceof Error ? error.message : "RENEWAL_FAILED",
			});
			failed += 1;
		}
	}

	return { claimed, ordered, failed };
}
