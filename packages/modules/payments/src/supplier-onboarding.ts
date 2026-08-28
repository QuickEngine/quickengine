// Type-only: erased at compile time, so it never enters the runtime module
// graph of route registration (hard rule 12 concerns real imports).
import type Stripe from "stripe";
import type { PaymentEnvironment } from "./provider";

/**
 * Getting a supplier ready to RECEIVE money.
 *
 * ── Why this is not the merchant onboarding ──────────────────────────────────
 *
 * ⚠️ This was written believing a supplier could be onboarded with `transfers`
 * alone, sparing them the full payments verification. Stripe refuses that on a
 * Standard account — see `SUPPLIER_CAPABILITIES`. The distinction that survives
 * is not a lighter form but WHO the account belongs to: the supplier holds it,
 * and QuickEngine never touches their banking details.
 *
 * ── Standard, for the same reason merchants are ──────────────────────────────
 *
 * 🔑 The supplier holds a full Stripe account they own, with their own
 * dashboard. Express and Custom both require the platform to accept liability
 * for seller losses and let Stripe hold reserves against the platform balance —
 * paying for somebody else's business outcome, which hard rule 7 exists to stop.
 * Proved on 2026-08-23: both are refused outright until that is accepted.
 *
 * ⚠️ So the supplier does their OWN identity verification with Stripe. Nothing
 * about their bank details, tax id or documents ever reaches QuickEngine.
 */

export class SupplierOnboardingError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
	}
}

async function stripeFor(environment: PaymentEnvironment) {
	// Lazily imported: nothing about defining this needs the SDK in the module
	// graph of route registration (hard rule 12).
	const [{ default: Stripe }, { serverEnv }] = await Promise.all([
		import("stripe"),
		import("@quickengine/env/server"),
	]);
	const secret =
		environment === "test"
			? serverEnv.STRIPE_CONNECT_TEST_SECRET_KEY
			: serverEnv.STRIPE_CONNECT_LIVE_SECRET_KEY;
	if (!secret) {
		throw new SupplierOnboardingError(
			`Stripe Connect ${environment} mode is not configured.`,
			"NOT_CONFIGURED",
		);
	}
	return new Stripe(secret);
}

/**
 * What Stripe will actually grant a supplier.
 *
 * 🔴 `card_payments` is here because Stripe REFUSES to grant `transfers`
 * without it on a Standard account: "You cannot request the `transfers`
 * capability without the `card_payments` capability for accounts when
 * controller[stripe_dashboard][type]=full, which includes Standard accounts."
 *
 * ⚠️ So the "supplier only receives, therefore lighter onboarding" idea does
 * not survive contact with Stripe. It is true of Express and Custom, and both
 * of those require the platform to accept liability for seller losses — which
 * is exactly the trade hard rule 7 exists to refuse. Standard keeps the supplier
 * owning their own account, their own disputes and their own losses, and the
 * price is that they complete the full payments verification.
 *
 * 🔑 The practical difference for a supplier is a few more fields, once. It is
 * not a different KIND of onboarding, and they end up with a full Stripe account
 * they can use for anything.
 */
const SUPPLIER_CAPABILITIES = {
	card_payments: { requested: true },
	transfers: { requested: true },
} as const;

export type SupplierAccountState = {
	externalAccountId: string;
	/** Whether Stripe will actually let a transfer land yet. */
	transfersEnabled: "yes" | "no" | "unknown";
	status: "pending" | "active" | "restricted";
	/** What Stripe is still waiting for, as its own machine-readable codes. */
	requirements: string | null;
};

/**
 * Start or resume a supplier's Stripe onboarding.
 *
 * 🔴 UPDATE rather than retrieve when the account already exists. An account
 * created before a capability was requested can never receive one, and merely
 * reading it back would report that broken state faithfully for ever. Requesting
 * a capability an account already holds is a no-op, so resuming is safe.
 */
export async function startSupplierOnboarding(input: {
	environment: PaymentEnvironment;
	existingAccountId?: string | null;
	email?: string | null;
	country?: string | null;
	refreshUrl: string;
	returnUrl: string;
}): Promise<SupplierAccountState & { onboardingUrl: string }> {
	const stripe = await stripeFor(input.environment);
	const account = input.existingAccountId
		? await stripe.accounts.update(input.existingAccountId, {
				capabilities: SUPPLIER_CAPABILITIES,
			})
		: await stripe.accounts.create({
				type: "standard",
				...(input.email ? { email: input.email } : {}),
				...(input.country ? { country: input.country } : {}),
				capabilities: SUPPLIER_CAPABILITIES,
			});

	const link = await stripe.accountLinks.create({
		account: account.id,
		refresh_url: input.refreshUrl,
		return_url: input.returnUrl,
		type: "account_onboarding",
	});

	return { ...toState(account), onboardingUrl: link.url };
}

/**
 * Ask Stripe what it thinks of this account right now.
 *
 * ⚠️ Read from the PROVIDER, never from our own stored copy. Onboarding
 * finishes in Stripe's UI, on the supplier's own time, and nothing tells us —
 * so a stored `pending` is a guess about the past, and the difference between it
 * and the truth is a transfer that fails for a supplier who is actually ready.
 */
export async function readSupplierAccount(input: {
	environment: PaymentEnvironment;
	externalAccountId: string;
}): Promise<SupplierAccountState> {
	const stripe = await stripeFor(input.environment);
	return toState(await stripe.accounts.retrieve(input.externalAccountId));
}

function toState(account: Stripe.Account): SupplierAccountState {
	const transfers = account.capabilities?.transfers;
	/**
	 * 🔴 The capability, not `payouts_enabled` and not `charges_enabled`.
	 *
	 * `transfers: "active"` is the only thing that decides whether money can
	 * LAND on the account. Payouts govern the separate step of Stripe moving it
	 * on to their bank, and a supplier can be perfectly able to receive while
	 * their payout schedule is still being set up.
	 */
	const transfersEnabled =
		transfers === "active" ? "yes" : transfers ? "no" : "unknown";

	const due = account.requirements?.currently_due ?? [];
	const disabled = account.requirements?.disabled_reason ?? null;

	return {
		externalAccountId: account.id,
		transfersEnabled,
		status:
			transfersEnabled === "yes"
				? "active"
				: disabled
					? "restricted"
					: "pending",
		requirements: due.length > 0 ? due.join(",") : disabled,
	};
}
