import type { PaymentProvider, PaymentProviderId } from "../provider";
import { stripePaymentProvider } from "./stripe";

/**
 * Which providers exist.
 *
 * Adding Polar, PayPal or Square means writing one file next to `stripe.ts` and
 * adding a line here. Nothing above the seam changes — that is the entire point
 * of `provider.ts`.
 *
 * ⚠️ `manual` is deliberately absent. Cash, e-transfer and cheques are recorded
 * through `recordPaymentCommand` with `provider: "manual"` and never touch a
 * network, so there is nothing for them to implement. Giving them a stub here
 * would invite code to call `createCharge` on money that already changed hands
 * in person.
 */
const PROVIDERS: Partial<Record<PaymentProviderId, PaymentProvider>> = {
	stripe: stripePaymentProvider,
};

export class UnsupportedPaymentProviderError extends Error {
	constructor(readonly provider: string) {
		super(`No payment integration is configured for "${provider}".`);
	}
}

/**
 * The integration for a provider name, or a thrown error naming it.
 *
 * Throws rather than returning null because every caller is about to move
 * money: silently continuing with no provider is the failure mode where an
 * order is marked paid and nobody was ever charged.
 */
export function getPaymentProvider(provider: string): PaymentProvider {
	const found = PROVIDERS[provider as PaymentProviderId];
	if (!found) throw new UnsupportedPaymentProviderError(provider);
	return found;
}

/** Whether a provider can be charged through, as opposed to only recorded. */
export function isChargeableProvider(provider: string): boolean {
	return provider in PROVIDERS;
}

export { stripePaymentProvider };
