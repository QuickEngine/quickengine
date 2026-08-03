import { constructStripeEvent, getStripe } from "@quickengine/billing";
import type {
	PaymentProvider,
	ProviderAccount,
	VerifiedProviderEvent,
} from "../provider";

/**
 * Stripe, behind the seam.
 *
 * The only file in the module that names Stripe. It uses **destination
 * charges**: the shopper pays, funds route to the business's connected account,
 * and QuickEngine may keep an application fee.
 *
 * ⚠️ Everything here talks to the network. Nothing here decides an amount — the
 * caller computes that from the catalog, because a price arriving from outside
 * is a price an attacker chose.
 */

/**
 * Stripe reports two capabilities separately and they genuinely differ: an
 * account can accept charges days before payouts clear review. Collapsing them
 * into one "connected" boolean would either block a business that could already
 * sell, or promise payouts that cannot happen yet.
 */
function toAccount(account: {
	id: string;
	charges_enabled?: boolean;
	payouts_enabled?: boolean;
}): ProviderAccount {
	return {
		externalAccountId: account.id,
		chargesEnabled: account.charges_enabled ?? false,
		payoutsEnabled: account.payouts_enabled ?? false,
	};
}

export const stripePaymentProvider: PaymentProvider = {
	id: "stripe",

	async startOnboarding(params) {
		const account = await getStripe().accounts.create({
			// Express: Stripe hosts onboarding and owns the compliance burden. A
			// business that has outgrown it can be migrated; starting with Standard
			// would put KYC, disputes and tax forms on us from day one.
			type: "express",
			email: params.email,
			country: params.country,
		});

		const link = await getStripe().accountLinks.create({
			account: account.id,
			refresh_url: params.refreshUrl,
			return_url: params.returnUrl,
			type: "account_onboarding",
		});

		return { account: toAccount(account), onboardingUrl: link.url };
	},

	async getAccount(externalAccountId) {
		return toAccount(await getStripe().accounts.retrieve(externalAccountId));
	},

	async createCharge(params) {
		const intent = await getStripe().paymentIntents.create({
			amount: params.amountCents,
			currency: params.currency.toLowerCase(),
			// Omitted entirely when zero. Stripe rejects an explicit 0 here, and a
			// workspace on no platform fee is the normal case.
			application_fee_amount:
				params.applicationFeeCents > 0 ? params.applicationFeeCents : undefined,
			transfer_data: { destination: params.connectedAccountId },
			metadata: params.metadata,
		});
		return {
			externalPaymentId: intent.id,
			clientSecret: intent.client_secret,
		};
	},

	async refund(params) {
		const refund = await getStripe().refunds.create({
			payment_intent: params.externalPaymentId,
			// Absent means "all of it" to Stripe, which matches the seam's contract.
			amount: params.amountCents,
			...(params.reason === "duplicate" ||
			params.reason === "fraudulent" ||
			params.reason === "requested_by_customer"
				? { reason: params.reason }
				: {}),
		});
		return {
			externalRefundId: refund.id,
			// `pending` is real: bank rails can take days. Reporting it as settled
			// would tell a customer their money is back before it is.
			settled: refund.status === "succeeded",
		};
	},

	async verifyWebhook(
		rawBody,
		signature,
	): Promise<VerifiedProviderEvent | null> {
		try {
			const event = constructStripeEvent(rawBody, signature);
			const object = event.data.object as { id?: string; object?: string };

			// Only claim a payment id when the event is actually about one. A
			// `payout.paid` carries an id too, and mistaking it for a payment id
			// would attach a refund or a status change to the wrong row.
			const externalPaymentId =
				object.object === "payment_intent" ? (object.id ?? null) : null;

			return {
				id: event.id,
				type: event.type,
				externalPaymentId,
				payload: event,
			};
		} catch {
			// 🔴 A bad signature is not an error to log loudly and retry — it is an
			// unauthenticated request. Null, and the caller answers 400.
			return null;
		}
	},
};
