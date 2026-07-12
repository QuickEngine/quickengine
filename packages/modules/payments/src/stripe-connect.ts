import { getStripe } from "@quickengine/billing";

// The Stripe Connect integration boundary. These are the only functions that talk to
// Stripe's network; everything else in the module is pure/DB and testable offline.
// They're wired live once the QuickDash host app + Stripe keys are in place (same
// deferral as Invoicing's PDF layer). Connected accounts use "destination charges":
// the customer pays, funds route to the workspace's account, QuickEngine optionally
// keeps an application fee.

/** Create a new Express connected account for a workspace. Returns the acct_ id. */
export async function createConnectedAccount(params: {
	email?: string;
	country?: string;
}): Promise<string> {
	const account = await getStripe().accounts.create({
		type: "express",
		email: params.email,
		country: params.country,
	});
	return account.id;
}

/** Hosted onboarding link so the workspace can finish connecting its account. */
export async function createAccountOnboardingLink(params: {
	accountId: string;
	refreshUrl: string;
	returnUrl: string;
}): Promise<string> {
	const link = await getStripe().accountLinks.create({
		account: params.accountId,
		refresh_url: params.refreshUrl,
		return_url: params.returnUrl,
		type: "account_onboarding",
	});
	return link.url;
}

/**
 * Create a PaymentIntent that charges the customer and routes funds to the
 * workspace's connected account, keeping an optional application fee. Returns the
 * intent id + client secret for the frontend to confirm.
 */
export async function createDestinationPaymentIntent(params: {
	amountCents: number;
	currency: string;
	connectedAccountId: string;
	applicationFeeCents: number;
	metadata?: Record<string, string>;
}): Promise<{ id: string; clientSecret: string | null }> {
	const intent = await getStripe().paymentIntents.create({
		amount: params.amountCents,
		currency: params.currency.toLowerCase(),
		application_fee_amount:
			params.applicationFeeCents > 0 ? params.applicationFeeCents : undefined,
		transfer_data: { destination: params.connectedAccountId },
		metadata: params.metadata,
	});
	return { id: intent.id, clientSecret: intent.client_secret };
}
