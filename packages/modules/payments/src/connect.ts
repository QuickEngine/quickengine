import { z } from "zod";
import {
	getPaymentAccount,
	setDefaultPaymentProvider,
	upsertPaymentAccount,
	workspaceEnvironment,
} from "./payments";
import type { PaymentEnvironment } from "./provider";
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

export const paymentProviderInputSchema = z.object({
	provider: z.enum(["stripe", "paypal"]),
});

/**
 * Connecting a business's own payment account, and reading its state.
 *
 * This is the layer the API calls. It knows about workspaces and persistence;
 * it does not know about Stripe. Everything provider-specific is behind
 * `getPaymentProvider`.
 *
 * A workspace may connect more than one provider. Exactly one connected account
 * is the default used for new checkout attempts; each payment retains its own
 * provider so settlement and refunds continue through the original processor.
 */

export type ConnectStatus = {
	environment: PaymentEnvironment;
	provider: string;
	connected: boolean;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	status: "pending" | "active" | "restricted" | "disabled";
	/**
	 * How this provider was connected, for providers a business owns outright.
	 *
	 * 🔴 Carries the client id and nothing else. The client id publicly
	 * identifies the app and lets somebody confirm they connected the right one;
	 * the secret is never described, never returned, and never logged.
	 */
	credentials?: {
		clientId: string | null;
		webhookConfigured: boolean;
	};
};

const notConnected = (
	environment: PaymentEnvironment,
	provider = "stripe",
): ConnectStatus => ({
	environment,
	provider,
	connected: false,
	chargesEnabled: false,
	payoutsEnabled: false,
	status: "pending",
});

/**
 * What a business pastes in to connect a provider it owns outright.
 *
 * PayPal only. Stripe has Connect, so it never needs this — and accepting a
 * Stripe secret key here would mean holding a credential that can do far more
 * than take payments for one business.
 */
export const providerCredentialsInputSchema = z.object({
	provider: z.literal("paypal"),
	clientId: z.string().trim().min(1).max(255),
	clientSecret: z.string().trim().min(1).max(512),
	/**
	 * Optional at connect time, required before refunds and settlement can be
	 * trusted — a business can create the app first and add its webhook after.
	 * The page says which of the two states it is in rather than pretending a
	 * half-configured connection is finished.
	 */
	webhookId: z.string().trim().max(255).optional(),
});

/**
 * Connect a business's own provider app.
 *
 * 🔴 The credentials are VALIDATED against the provider before anything is
 * stored. A typo must fail here, in a form the operator is looking at, and not
 * silently at their first sale — which is exactly what storing first and
 * discovering later would produce.
 *
 * ⚠️ Nothing here is ever returned to the caller. The response is a status, and
 * `readPaymentAccount` describes only the client id and whether a webhook is
 * configured. The secret goes in and never comes back out.
 */
export async function connectProviderCredentials(input: {
	workspaceId: string;
	provider: string;
	clientId: string;
	clientSecret: string;
	webhookId?: string;
}): Promise<ConnectStatus> {
	if (input.provider !== "paypal") {
		throw new Error("PROVIDER_DOES_NOT_TAKE_CREDENTIALS");
	}
	const environment = await workspaceEnvironment(input.workspaceId);

	// Lazily imported: this file is reachable from route registration, and the
	// PayPal client must not enter that module graph. Hard rule 12.
	const { getPayPalAccessToken } = await import("./providers/paypal-client");
	const { encryptProviderCredentials } = await import("./provider-credentials");

	try {
		await getPayPalAccessToken({
			clientId: input.clientId,
			clientSecret: input.clientSecret,
			environment: environment === "test" ? "sandbox" : "live",
		});
	} catch {
		// 🔴 Deliberately does not forward the provider's message. A failed
		// authentication reply can echo parts of what was sent, and this is the one
		// request in the system whose body is a payment credential.
		throw new Error("PROVIDER_CREDENTIALS_REJECTED");
	}

	await upsertPaymentAccount(input.workspaceId, input.provider, {
		environment,
		credentials: encryptProviderCredentials({
			clientId: input.clientId,
			clientSecret: input.clientSecret,
			webhookId: input.webhookId,
		}),
		// The credentials authenticate, so the account can take money. Unlike
		// Stripe there is no asynchronous capability review to wait on — the
		// business already completed that with PayPal before it had an app.
		externalAccountId: `app:${input.clientId}`,
		status: "active",
		chargesEnabled: true,
		// PayPal pays out to the business's own PayPal balance, which is theirs to
		// withdraw. There is no separate payout enablement for us to track.
		payoutsEnabled: true,
	});

	return {
		environment,
		provider: input.provider,
		connected: true,
		chargesEnabled: true,
		payoutsEnabled: true,
		status: "active",
	};
}

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
	const environment = await workspaceEnvironment(input.workspaceId);
	const provider = getPaymentProvider(providerId);
	const existing = await getPaymentAccount(input.workspaceId, providerId);

	if (existing?.chargesEnabled) {
		throw new Error("PAYMENT_ACCOUNT_ALREADY_CONNECTED");
	}

	const { account, onboardingUrl } = await provider.startOnboarding({
		environment,
		existingAccountId: existing?.externalAccountId ?? undefined,
		email: input.email,
		country: input.country,
		returnUrl: input.returnUrl,
		refreshUrl: input.refreshUrl,
	});

	const status = await persist(
		input.workspaceId,
		providerId,
		environment,
		account,
	);
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
	provider?: string,
): Promise<ConnectStatus> {
	const existing = await getPaymentAccount(workspaceId, provider);
	const environment = await workspaceEnvironment(workspaceId);
	if (!existing?.externalAccountId) return notConnected(environment, provider);
	if (existing.environment !== environment)
		throw new Error("PAYMENT_ENVIRONMENT_MISMATCH");

	const providerId = existing.provider ?? "stripe";
	const account = await getPaymentProvider(providerId).getAccount(
		existing.externalAccountId,
		environment,
	);
	return persist(workspaceId, providerId, environment, account);
}

/** Our stored view, with no network call. */
export async function readPaymentAccount(
	workspaceId: string,
	provider?: string,
): Promise<ConnectStatus> {
	const existing = await getPaymentAccount(workspaceId, provider);
	const environment = await workspaceEnvironment(workspaceId);
	if (!existing?.externalAccountId) return notConnected(environment, provider);
	if (existing.environment !== environment)
		throw new Error("PAYMENT_ENVIRONMENT_MISMATCH");
	const { describeProviderCredentials } = await import(
		"./provider-credentials"
	);
	const described = describeProviderCredentials(existing.credentials ?? null);
	return {
		environment,
		provider: existing.provider ?? "stripe",
		connected: true,
		chargesEnabled: existing.chargesEnabled,
		payoutsEnabled: existing.payoutsEnabled,
		status: existing.status,
		// Only present for a provider connected with its own credentials. Stripe
		// leaves it undefined, which is how the page knows which control to show.
		...(described.present
			? {
					credentials: {
						clientId: described.clientId,
						webhookConfigured: described.webhookConfigured,
					},
				}
			: {}),
	};
}

async function persist(
	workspaceId: string,
	provider: string,
	environment: PaymentEnvironment,
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

	await upsertPaymentAccount(workspaceId, provider, {
		environment,
		externalAccountId: account.externalAccountId,
		isDefault: false,
		status,
		chargesEnabled: account.chargesEnabled,
		payoutsEnabled: account.payoutsEnabled,
	});
	await setDefaultPaymentProvider(workspaceId, provider);

	return {
		environment,
		provider,
		connected: true,
		chargesEnabled: account.chargesEnabled,
		payoutsEnabled: account.payoutsEnabled,
		status,
	};
}
