import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";
import { getStripePriceId } from "./plans";
import { getStripe } from "./stripe";
import { findOrCreateStripeCustomer } from "./subscriptions";

/**
 * Create a subscription for the **Payment Element** flow — a fully custom checkout UI where
 * Stripe only provides the secure card fields. The subscription is created `default_incomplete`
 * so its first invoice yields a client secret the browser confirms with `stripe.confirmPayment`.
 * Org-scoped via metadata so the webhook (and our success page) can map it back. Returns the
 * confirmation client secret + the subscription id (which the success page reconciles).
 */
export const createSubscriptionForPaymentElement = async ({
	organizationId,
	billingEmail,
	billingName,
	planId,
	cycle,
	seats,
	promotionCode,
}: {
	organizationId: string;
	billingEmail: string;
	billingName?: string;
	planId: QuickEnginePlanId;
	cycle: QuickEngineBillingCycle;
	seats?: number;
	/** A code the customer typed, for example a founding-customer offer. */
	promotionCode?: string;
}): Promise<{ clientSecret: string | null; subscriptionId: string }> => {
	const priceId = getStripePriceId(planId, cycle);
	if (!priceId) {
		throw new Error(
			`No Stripe price configured for ${planId}/${cycle} (set STRIPE_PRICE_${planId.toUpperCase()}_${cycle.toUpperCase()}).`,
		);
	}

	const customer = await findOrCreateStripeCustomer({
		organizationId,
		email: billingEmail,
		name: billingName,
	});

	const quantity = Math.max(1, Math.floor(seats ?? 1));

	/**
	 * A code the customer typed, resolved before the subscription is created.
	 *
	 * 🔴 An unusable code THROWS rather than being ignored. Quietly charging full
	 * price to somebody who just typed a discount code is the worst available
	 * outcome: they believe they are paying one number, the card is charged
	 * another, and the first they learn of it is the statement. Better to refuse
	 * the whole subscription and say the code did not work.
	 *
	 * ⚠️ Looked up by CODE, not id, because the code is the customer-facing
	 * string. `active: true` excludes expired and exhausted ones, so a founding
	 * offer that has hit its redemption cap fails here rather than silently
	 * granting an eleventh person the price.
	 */
	const discounts: { promotion_code: string }[] = [];
	if (promotionCode?.trim()) {
		const found = await getStripe().promotionCodes.list({
			code: promotionCode.trim(),
			active: true,
			limit: 1,
		});
		const match = found.data[0];
		if (!match) {
			throw new Error("PROMOTION_CODE_INVALID");
		}
		discounts.push({ promotion_code: match.id });
	}

	const subscription = await getStripe().subscriptions.create({
		customer,
		items: [{ price: priceId, quantity }],
		...(discounts.length > 0 ? { discounts } : {}),
		payment_behavior: "default_incomplete",
		payment_settings: { save_default_payment_method: "on_subscription" },
		expand: ["latest_invoice.confirmation_secret"],
		metadata: { organizationId, planId },
	});

	const invoice = subscription.latest_invoice;
	const clientSecret =
		invoice && typeof invoice !== "string"
			? (invoice.confirmation_secret?.client_secret ?? null)
			: null;

	return { clientSecret, subscriptionId: subscription.id };
};
