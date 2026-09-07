import { type MeterKey, overageFor } from "./plans";
import { getStripe, isStripeConfigured } from "./stripe";
import { getSubscriptionForOrg } from "./subscriptions";

/**
 * Charge for usage past the included allowance.
 *
 * ── Why an invoice item and not a metered price ──────────────────────────────
 *
 * A metered Stripe price would need a second subscription item per meter, kept
 * in step with the plan for the life of the account. An invoice item attaches
 * the charge to the NEXT invoice and needs no such bookkeeping, which matters
 * because overage is rare: most accounts never produce one.
 *
 * 🔴 Idempotent by construction. Overage is calculated from a running total, so
 * the same block can be reported twice by a retry, a redelivered webhook, or two
 * requests crossing the line at once. The idempotency key is the account, the
 * meter and the block number — so charging block 3 twice writes one invoice item
 * and Stripe returns the first. Without it a busy account gets billed repeatedly
 * for the same thousand requests, which is the kind of error that ends a customer
 * relationship rather than merely annoying somebody.
 *
 * ⚠️ Silently does nothing when: the meter has no overage price, Stripe is not
 * configured, the account has no subscription, or the subscription is not live.
 * An account with no card is on a free plan and gets refused by the limit rather
 * than billed, and a canceled subscription is not ours to add charges to.
 */
export async function billOverage({
	organizationId,
	meter,
	unitsOverAllowance,
}: {
	organizationId: string;
	meter: MeterKey;
	/** Total units past the allowance this period, not the increment. */
	unitsOverAllowance: number;
}): Promise<{ charged: boolean; blocks: number; cents: number }> {
	const none = { charged: false, blocks: 0, cents: 0 };

	// 🔴 `overageFor`, never `OVERAGE` directly. Orders and products are priced
	// on free only, and reading the table would bill a paying customer for the
	// business they built.
	const { getAccountPlanId } = await import("./metering");
	const planId = await getAccountPlanId(organizationId);
	const price = overageFor(planId, meter);
	if (!price || unitsOverAllowance <= 0) return none;
	if (!isStripeConfigured()) return none;

	const subscription = await getSubscriptionForOrg(organizationId);
	if (!subscription?.stripeCustomerId) return none;
	if (subscription.status !== "active" && subscription.status !== "trialing") {
		return none;
	}

	/**
	 * Whole blocks only. Somebody 1 request past their allowance owes nothing
	 * until they cross the next block, which keeps a bill legible and stops a
	 * single stray request producing a one cent line item.
	 */
	const blocks = Math.floor(unitsOverAllowance / price.blockSize);
	if (blocks < 1) return none;

	const cents = blocks * price.cents;
	const period = new Date().toISOString().slice(0, 7);

	await getStripe().invoiceItems.create(
		{
			customer: subscription.stripeCustomerId,
			amount: cents,
			currency: "usd",
			description: `${meter} overage — ${blocks} × ${price.blockSize.toLocaleString()} (${period})`,
			metadata: { organizationId, meter, blocks: String(blocks), period },
		},
		{
			// The block number is what makes this safe to call repeatedly.
			idempotencyKey: `overage:${organizationId}:${meter}:${period}:${blocks}`,
		},
	);

	return { charged: true, blocks, cents };
}
