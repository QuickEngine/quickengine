import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";
import { getStripePriceId } from "./plans";
import { getStripe } from "./stripe";
import { findOrCreateStripeCustomer } from "./subscriptions";

/**
 * Create a Stripe Checkout Session for an organization + plan. Billing is org-scoped, so the
 * plan and seats bill to the org: `organizationId` rides in metadata so the webhook maps back,
 * and `seats` (the org's member count) is the subscription quantity. Today it returns a hosted
 * checkout URL; a future embedded UI reuses the same customer + price wiring.
 */
export const createCheckoutSession = async ({
	organizationId,
	billingEmail,
	billingName,
	planId,
	cycle,
	seats,
	successUrl,
	cancelUrl,
}: {
	organizationId: string;
	billingEmail: string;
	billingName?: string;
	planId: QuickEnginePlanId;
	cycle: QuickEngineBillingCycle;
	/** Number of seats to bill (org member count). Defaults to 1. */
	seats?: number;
	successUrl: string;
	cancelUrl: string;
}): Promise<{ id: string; url: string | null }> => {
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

	const session = await getStripe().checkout.sessions.create({
		mode: "subscription",
		customer,
		line_items: [{ price: priceId, quantity }],
		subscription_data: { metadata: { organizationId, planId } },
		metadata: { organizationId, planId },
		allow_promotion_codes: true,
		billing_address_collection: "auto",
		success_url: successUrl,
		cancel_url: cancelUrl,
	});

	return { id: session.id, url: session.url };
};
