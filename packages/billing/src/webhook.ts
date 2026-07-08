import { serverEnv } from "@quickengine/env/server";
import type Stripe from "stripe";
import { getStripe } from "./stripe";
import {
	markSubscriptionCanceled,
	setStatusForCustomer,
	upsertSubscriptionFromStripe,
} from "./subscriptions";

const customerId = (customer: unknown): string | undefined => {
	if (typeof customer === "string") return customer;
	if (customer && typeof customer === "object" && "id" in customer) {
		return String((customer as { id: unknown }).id);
	}
	return undefined;
};

/**
 * Verify a raw webhook payload against STRIPE_WEBHOOK_SECRET and return the
 * typed event. Throws if the signature is invalid — callers should 400.
 */
export const constructStripeEvent = (
	payload: string | Buffer,
	signature: string,
): Stripe.Event => {
	if (!serverEnv.STRIPE_WEBHOOK_SECRET) {
		throw new Error("STRIPE_WEBHOOK_SECRET is not set");
	}
	return getStripe().webhooks.constructEvent(
		payload,
		signature,
		serverEnv.STRIPE_WEBHOOK_SECRET,
	);
};

/**
 * Apply a verified Stripe event to our subscription state. Idempotent: every
 * handler is an upsert/set keyed by the Stripe customer or subscription, so
 * redelivered events converge to the same result.
 */
export const handleStripeEvent = async (event: Stripe.Event): Promise<void> => {
	switch (event.type) {
		case "customer.subscription.created":
		case "customer.subscription.updated":
			await upsertSubscriptionFromStripe(
				event.data.object as Stripe.Subscription,
			);
			break;
		case "customer.subscription.deleted":
			await markSubscriptionCanceled(event.data.object as Stripe.Subscription);
			break;
		case "invoice.paid": {
			const id = customerId((event.data.object as Stripe.Invoice).customer);
			if (id) await setStatusForCustomer(id, "active");
			break;
		}
		case "invoice.payment_failed": {
			const id = customerId((event.data.object as Stripe.Invoice).customer);
			if (id) await setStatusForCustomer(id, "past_due");
			break;
		}
		default:
			// Other events are acknowledged but not acted on.
			break;
	}
};
