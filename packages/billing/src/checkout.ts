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
}: {
	organizationId: string;
	billingEmail: string;
	billingName?: string;
	planId: QuickEnginePlanId;
	cycle: QuickEngineBillingCycle;
	seats?: number;
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

	const subscription = await getStripe().subscriptions.create({
		customer,
		items: [{ price: priceId, quantity }],
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
