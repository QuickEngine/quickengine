import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";
import { getStripePriceId } from "./plans";
import { getStripe } from "./stripe";
import { findOrCreateStripeCustomer } from "./subscriptions";

/**
 * Create a Stripe Checkout Session for a signed-in user + plan. This is the
 * reusable primitive: today it returns a hosted-checkout URL (fine for sandbox
 * testing), and the future custom Elements/embedded UI reuses the same customer
 * + price wiring. `userId` rides in metadata so the webhook can map back.
 */
export const createCheckoutSession = async ({
	user,
	planId,
	cycle,
	successUrl,
	cancelUrl,
}: {
	user: { id: string; email: string; name?: string };
	planId: QuickEnginePlanId;
	cycle: QuickEngineBillingCycle;
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
		userId: user.id,
		email: user.email,
		name: user.name,
	});

	const session = await getStripe().checkout.sessions.create({
		mode: "subscription",
		customer,
		line_items: [{ price: priceId, quantity: 1 }],
		subscription_data: { metadata: { userId: user.id, planId } },
		metadata: { userId: user.id, planId },
		allow_promotion_codes: true,
		billing_address_collection: "auto",
		success_url: successUrl,
		cancel_url: cancelUrl,
	});

	return { id: session.id, url: session.url };
};
