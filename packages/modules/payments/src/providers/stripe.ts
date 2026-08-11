import type Stripe from "stripe";
import type {
	PaymentEnvironment,
	PaymentProvider,
	ProviderAccount,
	VerifiedProviderEvent,
} from "../provider";

/**
 * 🔴 Loaded on FIRST USE, never at import time.
 *
 * This file is reachable from `registerAllRoutes` via the checkout route, so a
 * top-level Stripe import would drag the SDK
 * a payment SDK into the module graph of every route registration, including a
 * cold start and the OpenAPI route-table test, which then timed out in CI at
 * 5000ms.
 *
 * Same failure and same fix as the mail provider in `customer-auth-dependencies.ts`.
 * Nothing about DEFINING a payment provider needs the SDK; only calling one does.
 */
const clients = new Map<PaymentEnvironment, Stripe>();

async function stripeFor(environment: PaymentEnvironment) {
	const [{ default: Stripe }, { serverEnv }] = await Promise.all([
		import("stripe"),
		import("@quickengine/env/server"),
	]);
	const secret =
		environment === "test"
			? serverEnv.STRIPE_CONNECT_TEST_SECRET_KEY
			: serverEnv.STRIPE_CONNECT_LIVE_SECRET_KEY;
	if (!secret) {
		throw new Error(`Stripe Connect ${environment} mode is not configured.`);
	}
	const existing = clients.get(environment);
	if (existing) return existing;
	const client = new Stripe(secret);
	clients.set(environment, client);
	return client;
}

async function webhookSecret(environment: PaymentEnvironment) {
	const { serverEnv } = await import("@quickengine/env/server");
	const secret =
		environment === "test"
			? serverEnv.STRIPE_CONNECT_TEST_WEBHOOK_SECRET
			: serverEnv.STRIPE_CONNECT_LIVE_WEBHOOK_SECRET;
	if (!secret) {
		throw new Error(`Stripe Connect ${environment} webhook is not configured.`);
	}
	return secret;
}

/**
 * Stripe, behind the seam.
 *
 * The only file in the module that names Stripe. It uses **direct charges** on
 * the business's connected account, and QuickEngine may keep an application fee.
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
		const stripe = await stripeFor(params.environment);
		const account = params.existingAccountId
			? await stripe.accounts.retrieve(params.existingAccountId)
			: await stripe.accounts.create({
					// Express: Stripe hosts onboarding and owns the compliance burden. A
					// business that has outgrown it can be migrated; starting with Standard
					// would put KYC, disputes and tax forms on us from day one.
					type: "express",
					email: params.email,
					country: params.country,
				});

		const link = await stripe.accountLinks.create({
			account: account.id,
			refresh_url: params.refreshUrl,
			return_url: params.returnUrl,
			type: "account_onboarding",
		});

		return { account: toAccount(account), onboardingUrl: link.url };
	},

	async getAccount(externalAccountId, environment) {
		return toAccount(
			await (await stripeFor(environment)).accounts.retrieve(externalAccountId),
		);
	},

	async createCharge(params) {
		const intent = await (
			await stripeFor(params.environment)
		).paymentIntents.create(
			{
				amount: params.amountCents,
				currency: params.currency.toLowerCase(),
				// Omitted entirely when zero. Stripe rejects an explicit 0 here, and a
				// workspace on no platform fee is the normal case.
				application_fee_amount:
					params.applicationFeeCents > 0
						? params.applicationFeeCents
						: undefined,
				metadata: params.metadata,
			},
			// 🔴 DIRECT CHARGE. The charge is created ON the business's account, not
			// on ours with a transfer out (which is what `transfer_data.destination`
			// did before 2026-08-03).
			//
			// Three reasons, in the order they matter:
			//
			// 1. **Liability.** With destination charges, chargebacks and refunds come
			//    out of the PLATFORM's balance. A merchant who racks up disputes or
			//    disappears owing money leaves QuickEngine holding it, and the
			//    exposure grows with how successful our customers are.
			// 2. **Whose name is on the statement.** Direct charges put the business
			//    on the buyer's bank statement. Destination charges put ours there —
			//    in front of a shopper who has never heard of us, which is the single
			//    biggest cause of "I don't recognise this charge" disputes. It also
			//    contradicts what every other surface here promises: the mail, the
			//    portal and the branding all say the business, never us.
			// 3. **Posture.** We sell software. Being merchant of record makes us a
			//    payment facilitator, which is a heavier regulatory position than
			//    this product wants.
			{ stripeAccount: params.connectedAccountId },
		);
		return {
			externalPaymentId: intent.id,
			nextAction: intent.client_secret
				? { type: "client_secret", clientSecret: intent.client_secret }
				: { type: "none" },
		};
	},

	async refund(params) {
		const refund = await (await stripeFor(params.environment)).refunds.create(
			{
				payment_intent: params.externalPaymentId,
				// Absent means "all of it" to Stripe, which matches the seam's contract.
				amount: params.amountCents,
				...(params.reason === "duplicate" ||
				params.reason === "fraudulent" ||
				params.reason === "requested_by_customer"
					? { reason: params.reason }
					: {}),
			},
			// 🔴 Must run on the SAME account the charge was created on. A direct
			// charge does not exist on the platform account at all, so refunding
			// without this answers "no such payment_intent" — and the money stays
			// with the merchant while our ledger says refunded.
			{ stripeAccount: params.connectedAccountId },
		);
		return {
			externalRefundId: refund.id,
			// `pending` is real: bank rails can take days. Reporting it as settled
			// would tell a customer their money is back before it is.
			settled: refund.status === "succeeded",
		};
	},

	async verifyWebhook(
		request,
		environment,
	): Promise<VerifiedProviderEvent | null> {
		try {
			const signature = request.headers["stripe-signature"];
			if (!signature) return null;
			const stripe = await stripeFor(environment);
			const event = stripe.webhooks.constructEvent(
				request.rawBody,
				signature,
				await webhookSecret(environment),
			);
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
				externalAccountId:
					typeof event.account === "string" ? event.account : null,
				payload: event,
			};
		} catch {
			// 🔴 A bad signature is not an error to log loudly and retry — it is an
			// unauthenticated request. Null, and the caller answers 400.
			return null;
		}
	},
};
