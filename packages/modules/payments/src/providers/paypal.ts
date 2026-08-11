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
		const trackingId = crypto.randomUUID();
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
		const created = await createPayPalOrder(await config(params.environment), {
			sellerMerchantId: sellerId(params.connectedAccountId),
			amountCents: params.amountCents,
			applicationFeeCents: params.applicationFeeCents,
			currency: params.currency,
			metadata: params.metadata,
		});
		return {
			externalPaymentId: created.orderId,
			nextAction: { type: "approval", approvalUrl: created.approvalUrl },
		};
	},

	async captureCharge(params) {
		const captured = await capturePayPalOrder(
			await config(params.environment),
			{
				sellerMerchantId: sellerId(params.connectedAccountId),
				orderId: params.externalPaymentId,
			},
		);
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
		const paypal = await config(params.environment);
		const merchantId = sellerId(params.connectedAccountId);
		const capture = await getPayPalOrderCapture(paypal, {
			sellerMerchantId: merchantId,
			orderId: params.externalPaymentId,
		});
		const refund = await refundPayPalCapture(paypal, {
			sellerMerchantId: merchantId,
			captureId: capture.captureId,
			amountCents: params.amountCents,
			currency: capture.currency,
		});
		return { externalRefundId: refund.refundId, settled: refund.settled };
	},

	async verifyWebhook(request, environment) {
		const paypal = await config(environment);
		if (!(await verifyPayPalWebhook(paypal, request))) return null;
		return parsePayPalWebhookEvent(JSON.parse(request.rawBody));
	},
};
