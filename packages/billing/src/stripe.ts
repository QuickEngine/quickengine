import { serverEnv } from "@quickengine/env/server";
import Stripe from "stripe";

let client: Stripe | undefined;

/**
 * Lazily construct the Stripe client from STRIPE_SECRET_KEY. Kept behind a
 * function (not a module-level singleton) so tests can mock this module, and so
 * importing the billing package never throws when Stripe isn't configured.
 */
export const getStripe = (): Stripe => {
	if (!serverEnv.STRIPE_SECRET_KEY) {
		throw new Error("STRIPE_SECRET_KEY is not set");
	}
	client ??= new Stripe(serverEnv.STRIPE_SECRET_KEY);
	return client;
};

/** Whether Stripe is configured — lets callers degrade gracefully. */
export const isStripeConfigured = (): boolean =>
	Boolean(serverEnv.STRIPE_SECRET_KEY);
