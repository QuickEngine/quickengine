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
 *
 * 🔴 `charges_enabled` on its own does NOT mean this account can take a card.
 * An Express account reports it while `card_payments` is still inactive, and
 * Stripe then rejects the PaymentIntent with "you cannot create a charge on a
 * connected account without the card_payments capability enabled". Reporting
 * such an account as ready tells the operator they are open for business while
 * every single checkout fails — which is exactly what happened on 2026-08-11,
 * during the first real Caffeinate purchase. Readiness must name the capability
 * that actually gates charging.
 */
function toAccount(account: {
	id: string;
	charges_enabled?: boolean;
	payouts_enabled?: boolean;
	capabilities?: { card_payments?: string; transfers?: string };
}): ProviderAccount {
	return {
		externalAccountId: account.id,
		chargesEnabled:
			(account.charges_enabled ?? false) &&
			account.capabilities?.card_payments === "active",
		payoutsEnabled: account.payouts_enabled ?? false,
	};
}

/**
 * `card_payments` is what actually gates taking a card on a direct charge.
 * `transfers` rides along so an application fee can be introduced later without
 * dragging every merchant back through onboarding for a second capability.
 */
const CONNECT_CAPABILITIES = {
	card_payments: { requested: true },
	transfers: { requested: true },
} as const;

export const stripePaymentProvider: PaymentProvider = {
	id: "stripe",

	async startOnboarding(params) {
		const stripe = await stripeFor(params.environment);
		const account = params.existingAccountId
			? // 🔴 UPDATE, not retrieve. An account created before capabilities were
				// requested can never take a card, and merely reading it back would
				// return that broken state faithfully forever — leaving the merchant
				// stuck behind a "connected" badge with no way out through the product.
				// Re-requesting on resume is what lets them recover by clicking finish
				// setup. Requesting a capability an account already holds is a no-op.
				await stripe.accounts.update(params.existingAccountId, {
					capabilities: CONNECT_CAPABILITIES,
				})
			: await stripe.accounts.create({
					/**
					 * 🔴 STANDARD, and the liability is the whole reason.
					 *
					 * This was `express`, justified in a comment claiming Standard "would
					 * put KYC, disputes and tax forms on us from day one". That had it
					 * exactly backwards, and the mistake shaped the integration.
					 *
					 * With **Standard** the merchant holds a full Stripe account, their
					 * own dashboard, and **their own disputes and losses**. With
					 * **Express** the platform takes those on — Stripe will not even
					 * create one until the platform acknowledges "you'll be liable for
					 * seller losses" and agrees to Stripe holding reserves against our
					 * balance to cover merchants' negative balances.
					 *
					 * ⚠️ Absorbing a merchant's chargebacks is paying for a business
					 * outcome they earned, which is the thing hard rule 7 exists to
					 * prevent — and it would scale with our customers' success while
					 * earning nothing, because QuickEngine takes no cut of a sale.
					 *
					 * Proved by trying all three on 2026-08-23: `standard` creates
					 * cleanly, `express` and `custom` are both refused until platform
					 * liability is accepted. Hosted onboarding and capability requests
					 * work identically on Standard, so nothing else here changes.
					 */
					type: "standard",
					email: params.email,
					country: params.country,
					// 🔴 Capabilities have to be REQUESTED. Omit them and the account
					// still creates, still onboards, still reports `charges_enabled` — and
					// then refuses every direct charge because `card_payments` was never
					// granted. Nothing surfaces the mistake until a customer tries to pay.
					capabilities: CONNECT_CAPABILITIES,
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
		const stripe = await stripeFor(params.environment);
		const off = params.offSession;
		const intent = await stripe.paymentIntents.create(
			{
				amount: params.amountCents,
				currency: params.currency.toLowerCase(),
				/**
				 * The platform's fee and the suppliers' money travel together.
				 *
				 * 🔴 A direct charge has exactly ONE fee field, so the supplier
				 * pass-through has to ride it. They are summed HERE, at the last
				 * possible moment, and never summed in storage — the payment row
				 * keeps `applicationFeeCents` and `supplierFeeCents` apart so the
				 * platform's revenue can never absorb a supplier's money.
				 *
				 * ⚠️ Omitted entirely when zero: Stripe rejects an explicit 0, and a
				 * workspace on no platform fee with no supplier is the normal case.
				 */
				application_fee_amount:
					params.applicationFeeCents + (params.supplierFeeCents ?? 0) > 0
						? params.applicationFeeCents + (params.supplierFeeCents ?? 0)
						: undefined,
				metadata: params.metadata,
				/**
				 * 🔴 Tells Stripe to keep the method for later, and tells the BANK
				 * that a recurring agreement is being set up. Skipping it does not
				 * merely fail to save the card — it makes the later off-session
				 * charge far more likely to be declined, because the mandate the
				 * bank expects was never established.
				 */
				setup_future_usage: params.saveForFutureUse ? "off_session" : undefined,
				...(off
					? {
							customer: off.providerCustomerId,
							payment_method: off.providerPaymentMethodId,
							/**
							 * ⚠️ Both are required together. `off_session` states nobody is
							 * present; `confirm` charges immediately rather than waiting for
							 * a browser that will never arrive.
							 */
							off_session: true,
							confirm: true,
						}
					: {}),
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
			/**
			 * ⚠️ An off-session charge has already succeeded or failed by now, so it
			 * has nothing for a browser to do. Handing back a client secret would
			 * have a renewal wait for a confirmation nobody is there to give.
			 */
			nextAction:
				!off && intent.client_secret
					? { type: "client_secret", clientSecret: intent.client_secret }
					: { type: "none" },
		};
	},

	/**
	 * What is needed to charge this customer again.
	 *
	 * 🔴 Read from the SUCCEEDED intent rather than remembered at creation.
	 * Stripe attaches the customer and the payment method when the charge
	 * actually completes, so anything captured earlier is a guess — and a
	 * subscription built on a guess fails on its second month.
	 */
	async readSavedMethod(params) {
		const intent = await (
			await stripeFor(params.environment)
		).paymentIntents.retrieve(params.externalPaymentId, {
			stripeAccount: params.connectedAccountId,
		});
		const customer =
			typeof intent.customer === "string"
				? intent.customer
				: intent.customer?.id;
		const method =
			typeof intent.payment_method === "string"
				? intent.payment_method
				: intent.payment_method?.id;
		if (!customer || !method) return null;
		return { providerCustomerId: customer, providerPaymentMethodId: method };
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
			const object = event.data.object as {
				id?: string;
				object?: string;
				payment_intent?: unknown;
			};

			// Only claim a payment id when the event is actually about one. A
			// `payout.paid` carries an id too, and mistaking it for a payment id
			// would attach a refund or a status change to the wrong row.
			//
			// 🔴 A refund arrives as `charge.refunded`, whose object is a CHARGE, so
			// its `id` is a `ch_...` and matches no payment row — we store the
			// PaymentIntent id. Reading only `payment_intent` here left every refund
			// event with a null payment id, and settlement dropped it at "event
			// carries no payment id" before any handler saw it. Found 2026-08-11,
			// after the refund handler itself was already written and could never
			// fire. The charge carries the intent it belongs to; use that.
			// ⚠️ A DISPUTE is a third object shape. Its `id` is a `dp_...`, matching
			// no payment row, and it carries the intent it disputes — the same trap
			// the refund defect fell into, one object type over. Both `charge` and
			// `dispute` are handled by the same branch because both name their
			// `payment_intent`.
			const externalPaymentId =
				object.object === "payment_intent"
					? (object.id ?? null)
					: (object.object === "charge" || object.object === "dispute") &&
							typeof object.payment_intent === "string"
						? object.payment_intent
						: null;

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
