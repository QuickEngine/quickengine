import { getAutoRecharge, setAutoRecharge } from "@quickengine/db";
import { getStripe } from "./stripe";
import {
	findOrCreateStripeCustomer,
	findStripeCustomerForOrg,
} from "./subscriptions";

/**
 * Buying prepaid AI credit.
 *
 * **A one-off payment, deliberately not Stripe metered billing.** Stripe never
 * learns what a customer used: it processes one payment for a chunk of credit and
 * our ledger is the only record of consumption. Two reasons that is the right
 * shape rather than a shortcut:
 *
 * - Metered billing charges **in arrears** — deliver the AI, then try to collect.
 *   Prepaid means the money is in hand before any of it is spent with the model
 *   provider, which is the entire point of the credit system.
 * - Pushing usage records would create a **second source of truth**. When Stripe's
 *   count and our ledger disagree — and on retries and partial failures they will
 *   — we would be reconciling two systems over a customer's money.
 *
 * It also keeps the billing principle intact: nothing per-invoice, per-customer or
 * per-record ever reaches Stripe, because Stripe only ever sees "bought $25 of
 * credit."
 */

/** Fixed packs rather than a free-text amount box. */
export const CREDIT_PACKS = [
	{ id: "small", amountCents: 1_000 },
	{ id: "medium", amountCents: 2_500 },
	{ id: "large", amountCents: 5_000 },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];

/**
 * Stripe's minimum charge is $0.50, and its fee is 2.9% + $0.30. A $1 top-up
 * would cost us a third of itself to process, so the floor is set well above the
 * point where a purchase stops being worth taking.
 */
export const MIN_TOPUP_CENTS = 500;

export const centsToMicros = (cents: number) => cents * 10_000;

/**
 * Start a credit purchase.
 *
 * Returns a client secret the browser confirms with Stripe Elements. **No credit
 * is granted here** — the balance only moves when the `payment_intent.succeeded`
 * webhook arrives, because that is the only point at which the money is real.
 * Granting on intent creation would hand out credit for abandoned checkouts.
 */
export async function createCreditTopUpIntent(input: {
	organizationId: string;
	billingEmail: string;
	billingName?: string;
	amountCents: number;
	/** Store the card for auto-recharge. Only ever set with explicit opt-in. */
	savePaymentMethod?: boolean;
}): Promise<{ clientSecret: string | null; paymentIntentId: string }> {
	const amountCents = Math.floor(input.amountCents);
	if (!Number.isFinite(amountCents) || amountCents < MIN_TOPUP_CENTS) {
		throw new Error("TOPUP_BELOW_MINIMUM");
	}

	const customer = await findOrCreateStripeCustomer({
		organizationId: input.organizationId,
		email: input.billingEmail,
		name: input.billingName,
	});

	const intent = await getStripe().paymentIntents.create({
		amount: amountCents,
		currency: "usd",
		customer,
		// The webhook has no other way to know whose balance this belongs to, and it
		// must never infer it from the customer record alone.
		metadata: {
			organizationId: input.organizationId,
			purpose: "credit_topup",
		},
		...(input.savePaymentMethod ? { setup_future_usage: "off_session" } : {}),
		automatic_payment_methods: { enabled: true },
	});

	return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

/**
 * Buy more credit automatically when the balance runs low.
 *
 * **Opt-in, off by default, and it disables itself on failure.** This is a standing
 * authorisation to charge a card with nobody watching, so every design choice here
 * is about it being hard to run away with:
 *
 * - A failed off-session charge **turns auto-recharge off** and records why. Expired
 *   cards and challenges needing the customer present do not resolve themselves, and
 *   retrying a declining card is how an account collects forty declines and a fraud
 *   flag rather than a payment.
 * - The charge is created but **no credit is granted here.** As with a manual top-up,
 *   the balance only moves when `payment_intent.succeeded` arrives — so a charge that
 *   fails after creation cannot leave credit behind.
 *
 * Returns what happened, so the caller can surface it rather than guess.
 */
export async function maybeAutoRecharge(input: {
	organizationId: string;
	balanceMicros: number;
}): Promise<
	| { charged: false; reason: "disabled" | "above_threshold" | "no_card" }
	| { charged: true; paymentIntentId: string }
	| { charged: false; reason: "failed"; message: string }
> {
	const settings = await getAutoRecharge(input.organizationId);
	if (!settings?.enabled) return { charged: false, reason: "disabled" };
	if (input.balanceMicros > settings.thresholdMicros) {
		return { charged: false, reason: "above_threshold" };
	}
	if (!settings.stripePaymentMethodId) {
		return { charged: false, reason: "no_card" };
	}

	const customer = await findStripeCustomerForOrg(input.organizationId);
	if (!customer) return { charged: false, reason: "no_card" };

	try {
		const intent = await getStripe().paymentIntents.create({
			amount: settings.amountCents,
			currency: "usd",
			customer,
			payment_method: settings.stripePaymentMethodId,
			off_session: true,
			confirm: true,
			metadata: {
				organizationId: input.organizationId,
				purpose: "credit_topup",
			},
		});
		return { charged: true, paymentIntentId: intent.id };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Card was declined.";
		// Off, not retried. The customer has to come back and fix the card, which is
		// the only thing that actually resolves this.
		await setAutoRecharge({
			organizationId: input.organizationId,
			enabled: false,
			thresholdMicros: settings.thresholdMicros,
			amountCents: settings.amountCents,
			stripePaymentMethodId: settings.stripePaymentMethodId,
			lastFailureAt: new Date(),
			lastFailureReason: message,
		});
		return { charged: false, reason: "failed", message };
	}
}
