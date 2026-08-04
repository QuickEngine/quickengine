import { z } from "zod";
import { getPaymentAccount, upsertPaymentAccount } from "./payments";
import { getPaymentProvider } from "./providers";

/**
 * What starting onboarding requires.
 *
 * Lives here rather than in the route so the OpenAPI document and the handler
 * cannot drift — they import the same object.
 *
 * ⚠️ The URLs are shape-checked here only. Whether they point at one of OUR
 * origins is enforced at the boundary (`isOwnOrigin` in `payments-routes.ts`),
 * because that is a deployment question this module has no business knowing.
 */
export const paymentOnboardingInputSchema = z.object({
	returnUrl: z.url().max(2048),
	refreshUrl: z.url().max(2048),
	provider: z.string().trim().min(1).max(50).optional(),
	email: z.email().max(320).optional(),
	// ISO 3166-1 alpha-2. Providers reject anything else, and inferring it from
	// a locale onboards a business in the wrong jurisdiction.
	country: z
		.string()
		.trim()
		.length(2)
		.regex(/^[A-Za-z]{2}$/)
		.optional(),
});

/**
 * Connecting a business's own payment account, and reading its state.
 *
 * This is the layer the API calls. It knows about workspaces and persistence;
 * it does not know about Stripe. Everything provider-specific is behind
 * `getPaymentProvider`.
 *
 * ⚠️ `payment_accounts.stripe_account_id` is a provider-specific column on a
 * provider-agnostic table — noted in `internal/planning/END_TO_END_AUDIT.md`.
 * The table has never been written to (its accessors had no callers until now),
 * so renaming it to `external_account_id` later is free. Left alone for now
 * rather than widening this slice.
 */

export type ConnectStatus = {
	provider: string;
	connected: boolean;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	status: "pending" | "active" | "restricted" | "disabled";
};

export class PaymentProviderConflictError extends Error {
	constructor(
		readonly connectedProvider: string,
		readonly requestedProvider: string,
	) {
		super(
			`This workspace is already connected to ${connectedProvider}. Disconnecting or switching payment providers is not available yet.`,
		);
	}
}

const NOT_CONNECTED: ConnectStatus = {
	provider: "stripe",
	connected: false,
	chargesEnabled: false,
	payoutsEnabled: false,
	status: "pending",
};

/**
 * Begin connecting an account, returning where to send the operator.
 *
 * 🔴 The account id is persisted BEFORE the URL is returned. If the write
 * happened after the redirect, a crash in between would leave a real, partially
 * onboarded account at the provider with nothing in our database pointing at
 * it — unreachable, un-chargeable, and invisible to support.
 *
 * Resumable: an operator who abandons onboarding and comes back gets a fresh
 * link for the SAME account rather than a second one. Account links are
 * single-use and short-lived by design, so re-issuing is the normal path, but
 * creating another account each time would scatter duplicates across the
 * provider.
 */
export async function startPaymentOnboarding(input: {
	workspaceId: string;
	provider?: string;
	email?: string;
	country?: string;
	returnUrl: string;
	refreshUrl: string;
}): Promise<{ onboardingUrl: string; status: ConnectStatus }> {
	const providerId = input.provider ?? "stripe";
	const provider = getPaymentProvider(providerId);
	const existing = await getPaymentAccount(input.workspaceId);
	if (existing && existing.provider !== providerId) {
		throw new PaymentProviderConflictError(existing.provider, providerId);
	}

	if (existing?.stripeAccountId) {
		const account = await provider.getAccount(existing.stripeAccountId);
		const { onboardingUrl } = await provider.startOnboarding({
			email: input.email,
			country: input.country,
			returnUrl: input.returnUrl,
			refreshUrl: input.refreshUrl,
		});
		const status = await persist(input.workspaceId, providerId, account);
		return { onboardingUrl, status };
	}

	const { account, onboardingUrl } = await provider.startOnboarding({
		email: input.email,
		country: input.country,
		returnUrl: input.returnUrl,
		refreshUrl: input.refreshUrl,
	});

	const status = await persist(input.workspaceId, providerId, account);
	return { onboardingUrl, status };
}

/**
 * Re-read the provider and update our copy.
 *
 * Onboarding finishes asynchronously — the operator returns to us long before
 * the provider has finished its checks — so the state stored at redirect time
 * is stale almost immediately. The dashboard calls this on load.
 */
export async function refreshPaymentAccount(
	workspaceId: string,
): Promise<ConnectStatus> {
	const existing = await getPaymentAccount(workspaceId);
	if (!existing?.stripeAccountId) return NOT_CONNECTED;

	const providerId = existing.provider ?? "stripe";
	const account = await getPaymentProvider(providerId).getAccount(
		existing.stripeAccountId,
	);
	return persist(workspaceId, providerId, account);
}

/** Our stored view, with no network call. */
export async function readPaymentAccount(
	workspaceId: string,
): Promise<ConnectStatus> {
	const existing = await getPaymentAccount(workspaceId);
	if (!existing?.stripeAccountId) return NOT_CONNECTED;
	return {
		provider: existing.provider ?? "stripe",
		connected: true,
		chargesEnabled: existing.chargesEnabled,
		payoutsEnabled: existing.payoutsEnabled,
		status: existing.status,
	};
}

async function persist(
	workspaceId: string,
	provider: string,
	account: {
		externalAccountId: string;
		chargesEnabled: boolean;
		payoutsEnabled: boolean;
	},
): Promise<ConnectStatus> {
	// "Can it take money" is the only question that matters for a status a human
	// reads. Payouts being disabled is a real problem but not one that stops a
	// sale, so it does not downgrade the account to restricted.
	const status = account.chargesEnabled ? "active" : "pending";

	await upsertPaymentAccount(workspaceId, {
		provider,
		stripeAccountId: account.externalAccountId,
		status,
		chargesEnabled: account.chargesEnabled,
		payoutsEnabled: account.payoutsEnabled,
	});

	return {
		provider,
		connected: true,
		chargesEnabled: account.chargesEnabled,
		payoutsEnabled: account.payoutsEnabled,
		status,
	};
}
