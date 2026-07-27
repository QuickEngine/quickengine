import { recordTopUp } from "@quickengine/db";
import { serverEnv } from "@quickengine/env/server";
import type Stripe from "stripe";
import { centsToMicros } from "./credit-topup";
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
		case "payment_intent.succeeded": {
			// Credit only lands here. A payment intent can be created and abandoned,
			// so this is the first moment the money is actually real.
			const intent = event.data.object as Stripe.PaymentIntent;
			if (intent.metadata?.purpose !== "credit_topup") break;
			const organizationId = intent.metadata?.organizationId;
			if (!organizationId) {
				// Nothing sensible to do: we cannot guess whose balance this is, and
				// guessing would credit the wrong account. Loud, because it means a
				// payment was taken that nobody received.
				throw new Error(
					`Credit top-up ${intent.id} has no organizationId in metadata.`,
				);
			}
			await recordTopUp({
				organizationId,
				// Stripe works in cents, the ledger in micros. One conversion, in one
				// place, so a rounding error has nowhere to hide.
				amountMicros: centsToMicros(intent.amount_received ?? intent.amount),
				stripePaymentIntentId: intent.id,
				description: "Credit top-up",
			});
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
