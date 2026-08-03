// ─────────────────────────────────────────────────────────────────────────────
// THE PAYMENT PROVIDER SEAM.
//
// 🔴 Every call that leaves this system to move money crosses this interface.
// Nothing above it may import Stripe, name Stripe, or assume Stripe.
//
// Why it exists, from `internal/planning/END_TO_END_AUDIT.md` (Blocker 1): the
// Stripe Connect integration was written, exported, and called by nothing —
// `createConnectedAccount`, `createAccountOnboardingLink`,
// `createDestinationPaymentIntent` and `upsertPaymentAccount` all had zero
// callers, so a workspace could not connect an account, let alone take a
// payment. Wiring that up Stripe-first would have meant rewriting charge,
// refund and webhook verification the moment a second provider arrived — and a
// second provider is the plan (Polar, PayPal, Square).
//
// The ledger below this seam is ALREADY provider-agnostic: `payments.provider`
// is a real column and `(provider, external_payment_id)` is the uniqueness key.
// This interface is the missing half.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a provider is called, as stored in `payments.provider`.
 *
 * ⚠️ These strings reach the database. Renaming one orphans every historical
 * row written under the old name, so treat them as permanent identifiers rather
 * than display labels.
 */
export type PaymentProviderId = "stripe" | "manual";

/** A connected account, in whatever shape the provider expresses it. */
export type ProviderAccount = {
	/** The provider's own id for the account. `acct_…` for Stripe. */
	externalAccountId: string;
	/** Can it accept charges yet? False during onboarding. */
	chargesEnabled: boolean;
	/** Can money reach the business's bank? Separate from charges, and often later. */
	payoutsEnabled: boolean;
};

export type ProviderCharge = {
	/** The provider's id for this charge. Stored as `external_payment_id`. */
	externalPaymentId: string;
	/**
	 * A token the browser needs to complete the payment, when the provider
	 * splits it that way. Null for providers that finish server-side.
	 *
	 * ⚠️ Safe to send to a client — it authorises paying ONE intent and nothing
	 * else — but it is not a secret to log or store.
	 */
	clientSecret: string | null;
};

export type ProviderRefund = {
	externalRefundId: string;
	/** Whether the money has actually moved, or is still in flight. */
	settled: boolean;
};

/**
 * A provider event that has been proven to come from the provider.
 *
 * 🔴 Only ever produced by `verifyWebhook`. Constructing one by hand, or
 * trusting a parsed body without verification, is how a forged request marks an
 * order paid.
 */
export type VerifiedProviderEvent = {
	id: string;
	type: string;
	/** The provider's own payment id, when the event concerns one. */
	externalPaymentId: string | null;
	payload: unknown;
};

export interface PaymentProvider {
	readonly id: PaymentProviderId;

	/**
	 * Begin connecting a business's own account.
	 *
	 * Returns a URL to send the operator to. The account exists in a pending
	 * state from this moment, which is why the caller persists
	 * `externalAccountId` before redirecting — losing it strands a real account
	 * at the provider with nothing pointing at it.
	 */
	startOnboarding(params: {
		email?: string;
		country?: string;
		returnUrl: string;
		refreshUrl: string;
	}): Promise<{ account: ProviderAccount; onboardingUrl: string }>;

	/** Re-read an account's capabilities. Onboarding finishes asynchronously. */
	getAccount(externalAccountId: string): Promise<ProviderAccount>;

	/**
	 * Charge a customer, routing the money to the business.
	 *
	 * 🔴 `amountCents` is authoritative and must be computed server-side from
	 * the catalog. A client that can name its own price can buy anything for a
	 * penny — this is the rule that lets a publishable credential exist at all.
	 *
	 * `applicationFeeCents` is QuickEngine's cut. It is a platform fee on
	 * infrastructure, NOT a fee on the business outcome: it is agreed up front
	 * per workspace, never charged per customer or per invoice.
	 */
	createCharge(params: {
		amountCents: number;
		currency: string;
		connectedAccountId: string;
		applicationFeeCents: number;
		metadata?: Record<string, string>;
	}): Promise<ProviderCharge>;

	/**
	 * Send money back.
	 *
	 * Omit `amountCents` for a full refund. Providers differ on partials, so a
	 * provider that cannot do them must throw rather than silently refund the
	 * whole amount.
	 */
	refund(params: {
		externalPaymentId: string;
		amountCents?: number;
		reason?: string;
	}): Promise<ProviderRefund>;

	/**
	 * Prove an inbound webhook really came from the provider.
	 *
	 * 🔴 Takes the RAW body, never a parsed object. Every provider signs the
	 * exact bytes it sent, so `JSON.parse` followed by `JSON.stringify` produces
	 * a different string and a signature that will not verify — key order and
	 * whitespace are not preserved.
	 *
	 * Returns null when the signature does not match. Callers must treat null as
	 * hostile and answer 400 without doing any work.
	 */
	verifyWebhook(
		rawBody: string,
		signature: string,
	): Promise<VerifiedProviderEvent | null>;
}
