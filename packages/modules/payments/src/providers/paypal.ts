import type {
	PaymentEnvironment,
	PaymentProvider,
	ProviderAccount,
	VerifiedProviderEvent,
} from "../provider";
import {
	capturePayPalOrder,
	createPayPalOrder,
	createPayPalSellerReferral,
	getPayPalOrderCapture,
	getPayPalSellerByMerchantId,
	getPayPalSellerByTrackingId,
	type PayPalConfig,
	refundPayPalCapture,
	verifyPayPalWebhook,
} from "./paypal-client";

const trackingPrefix = "tracking:";
const merchantPrefix = "merchant:";
/**
 * A business connected with its OWN PayPal app.
 *
 * The supported path. `merchant:` and `tracking:` belong to partner onboarding,
 * which QuickEngine does not use — they remain readable so an account connected
 * before this change keeps working rather than breaking at its next refund.
 */
const appPrefix = "app:";

/**
 * The credentials to call PayPal with, for a business we act as.
 *
 * 🔴 Loaded from the connected account row and decrypted per call rather than
 * cached. A cache here would keep a payment secret resident in memory for the
 * life of the process, and the call it saves is already making a network round
 * trip to PayPal.
 */
async function authForAccount(
	connectedAccountId: string,
	environment: PaymentEnvironment,
): Promise<PayPalConfig> {
	const { getPaymentAccountByExternalId } = await import("../payments");
	const account = await getPaymentAccountByExternalId(
		connectedAccountId,
		"paypal",
		environment,
	);
	if (!account?.credentials) {
		throw new Error("PAYMENT_ACCOUNT_NOT_FOUND");
	}
	const { decryptProviderCredentials } = await import(
		"../provider-credentials"
	);
	const credentials = decryptProviderCredentials(account.credentials);
	return {
		clientId: credentials.clientId,
		clientSecret: credentials.clientSecret,
		webhookId: credentials.webhookId,
		environment: environment === "test" ? "sandbox" : "live",
	};
}

/**
 * Which way round we are talking to PayPal for this account.
 *
 * `app:` means we authenticate AS the business, so there is no seller to name.
 * Anything else is the legacy partner shape, which still names one.
 */
async function callFor(
	connectedAccountId: string,
	environment: PaymentEnvironment,
): Promise<{ config: PayPalConfig; sellerMerchantId?: string }> {
	if (connectedAccountId.startsWith(appPrefix)) {
		return { config: await authForAccount(connectedAccountId, environment) };
	}
	return {
		config: await config(environment),
		sellerMerchantId: sellerId(connectedAccountId),
	};
}

async function config(environment: PaymentEnvironment): Promise<PayPalConfig> {
	const { serverEnv } = await import("@quickengine/env/server");
	const prefix = environment === "test" ? "TEST" : "LIVE";
	const legacyMatches =
		serverEnv.PAYPAL_ENVIRONMENT ===
		(environment === "test" ? "sandbox" : "live");
	const required = {
		clientId:
			serverEnv[`PAYPAL_${prefix}_CLIENT_ID`] ??
			(legacyMatches ? serverEnv.PAYPAL_CLIENT_ID : undefined),
		clientSecret:
			serverEnv[`PAYPAL_${prefix}_CLIENT_SECRET`] ??
			(legacyMatches ? serverEnv.PAYPAL_CLIENT_SECRET : undefined),
		partnerMerchantId:
			serverEnv[`PAYPAL_${prefix}_PARTNER_MERCHANT_ID`] ??
			(legacyMatches ? serverEnv.PAYPAL_PARTNER_MERCHANT_ID : undefined),
		partnerAttributionId:
			serverEnv[`PAYPAL_${prefix}_PARTNER_ATTRIBUTION_ID`] ??
			(legacyMatches ? serverEnv.PAYPAL_PARTNER_ATTRIBUTION_ID : undefined),
		webhookId:
			serverEnv[`PAYPAL_${prefix}_WEBHOOK_ID`] ??
			(legacyMatches ? serverEnv.PAYPAL_WEBHOOK_ID : undefined),
	};
	for (const [name, value] of Object.entries(required)) {
		if (!value) throw new Error(`PayPal is not configured (${name}).`);
	}
	return {
		...(required as Record<keyof typeof required, string>),
		environment: environment === "test" ? "sandbox" : "live",
	};
}

const account = (
	externalAccountId: string,
	ready: boolean,
): ProviderAccount => ({
	externalAccountId,
	chargesEnabled: ready,
	payoutsEnabled: ready,
});

const sellerId = (externalAccountId: string): string => {
	if (!externalAccountId.startsWith(merchantPrefix)) {
		throw new Error("PayPal seller onboarding is not complete.");
	}
	return externalAccountId.slice(merchantPrefix.length);
};

export function parsePayPalWebhookEvent(
	payload: unknown,
): VerifiedProviderEvent | null {
	const event = payload as {
		id?: string;
		event_type?: string;
		resource?: {
			payee?: { merchant_id?: string };
			supplementary_data?: { related_ids?: { order_id?: string } };
		};
	};
	if (!event.id || !event.event_type) return null;
	const canonicalType =
		event.event_type === "PAYMENT.CAPTURE.COMPLETED"
			? "payment_intent.succeeded"
			: event.event_type === "PAYMENT.CAPTURE.DENIED"
				? "payment_intent.payment_failed"
				: event.event_type === "PAYMENT.CAPTURE.REFUNDED"
					? "charge.refunded"
					: event.event_type;
	const merchantId = event.resource?.payee?.merchant_id;
	return {
		id: event.id,
		type: canonicalType,
		externalPaymentId:
			event.resource?.supplementary_data?.related_ids?.order_id ?? null,
		externalAccountId: merchantId ? `${merchantPrefix}${merchantId}` : null,
		payload,
	};
}

export const paypalPaymentProvider: PaymentProvider = {
	id: "paypal",

	async startOnboarding(params) {
		const trackingId = params.existingAccountId?.startsWith(trackingPrefix)
			? params.existingAccountId.slice(trackingPrefix.length)
			: crypto.randomUUID();
		const referral = await createPayPalSellerReferral(
			await config(params.environment),
			{
				trackingId,
				returnUrl: params.returnUrl,
			},
		);
		return {
			account: account(`${trackingPrefix}${trackingId}`, false),
			onboardingUrl: referral.onboardingUrl,
		};
	},

	async getAccount(externalAccountId, environment) {
		// 🔴 A business we authenticate AS has no partner status to look up — the
		// partner endpoints answer questions about somebody ELSE's seller account.
		// Its credentials were proven against PayPal at connect time, so re-reading
		// them is the check: if they still authenticate, it can still take money.
		if (externalAccountId.startsWith(appPrefix)) {
			const { getPayPalAccessToken } = await import("./paypal-client");
			try {
				await getPayPalAccessToken(
					await authForAccount(externalAccountId, environment),
				);
				return account(externalAccountId, true);
			} catch {
				// Revoked or rotated at PayPal. Reported as not chargeable rather than
				// thrown, so the Payments page can say "connect again" instead of
				// failing to load.
				return account(externalAccountId, false);
			}
		}
		const paypal = await config(environment);
		if (externalAccountId.startsWith(trackingPrefix)) {
			const status = await getPayPalSellerByTrackingId(
				paypal,
				externalAccountId.slice(trackingPrefix.length),
			);
			return status.merchantId
				? account(
						`${merchantPrefix}${status.merchantId}`,
						status.paymentsReceivable && status.primaryEmailConfirmed,
					)
				: account(externalAccountId, false);
		}
		const merchantId = sellerId(externalAccountId);
		const status = await getPayPalSellerByMerchantId(paypal, merchantId);
		return account(
			externalAccountId,
			status.paymentsReceivable && status.primaryEmailConfirmed,
		);
	},

	async createCharge(params) {
		const call = await callFor(params.connectedAccountId, params.environment);
		const created = await createPayPalOrder(call.config, {
			sellerMerchantId: call.sellerMerchantId,
			amountCents: params.amountCents,
			// 🔴 Zero when we authenticate as the business: QuickEngine takes no cut
			// of what a business earns, and a platform fee is only expressible at all
			// through a partner relationship it does not have.
			applicationFeeCents: call.sellerMerchantId
				? params.applicationFeeCents
				: 0,
			currency: params.currency,
			metadata: params.metadata,
		});
		return {
			externalPaymentId: created.orderId,
			nextAction: { type: "approval", approvalUrl: created.approvalUrl },
		};
	},

	async captureCharge(params) {
		const call = await callFor(params.connectedAccountId, params.environment);
		const captured = await capturePayPalOrder(call.config, {
			sellerMerchantId: call.sellerMerchantId,
			orderId: params.externalPaymentId,
		});
		return {
			externalCaptureId: captured.captureId,
			settled: captured.settled,
			event: {
				id: `capture:${captured.captureId}`,
				type: captured.settled
					? "payment_intent.succeeded"
					: "payment_intent.processing",
				externalPaymentId: params.externalPaymentId,
				externalAccountId: params.connectedAccountId,
				payload: { captureId: captured.captureId },
			},
		};
	},

	async refund(params) {
		const call = await callFor(params.connectedAccountId, params.environment);
		const capture = await getPayPalOrderCapture(call.config, {
			sellerMerchantId: call.sellerMerchantId,
			orderId: params.externalPaymentId,
		});
		const refund = await refundPayPalCapture(call.config, {
			sellerMerchantId: call.sellerMerchantId,
			captureId: capture.captureId,
			amountCents: params.amountCents,
			currency: capture.currency,
		});
		return { externalRefundId: refund.refundId, settled: refund.settled };
	},

	/**
	 * 🔴 Verified against the BUSINESS's own webhook id, supplied by the caller.
	 *
	 * Each business registers its webhook against its own PayPal app, so there is
	 * no platform-wide id that could check the signature. The caller resolves
	 * which business from the request PATH before calling this — never from the
	 * unverified body, which is exactly what an attacker would control.
	 *
	 * Without credentials this falls back to platform configuration, which is the
	 * legacy partner path. If neither can verify, `verifyPayPalWebhook` returns
	 * false and the event is refused: unverified is never treated as authentic.
	 */
	async verifyWebhook(request, environment, credentials) {
		const paypal = credentials
			? {
					clientId: credentials.clientId,
					clientSecret: credentials.clientSecret,
					webhookId: credentials.webhookId,
					environment: (environment === "test" ? "sandbox" : "live") as
						| "sandbox"
						| "live",
				}
			: await config(environment);
		if (!(await verifyPayPalWebhook(paypal, request))) return null;
		return parsePayPalWebhookEvent(JSON.parse(request.rawBody));
	},
};
