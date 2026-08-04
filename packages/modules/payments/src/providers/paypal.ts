import type {
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

async function config(): Promise<PayPalConfig> {
	const { serverEnv } = await import("@quickengine/env/server");
	const required = {
		clientId: serverEnv.PAYPAL_CLIENT_ID,
		clientSecret: serverEnv.PAYPAL_CLIENT_SECRET,
		partnerMerchantId: serverEnv.PAYPAL_PARTNER_MERCHANT_ID,
		partnerAttributionId: serverEnv.PAYPAL_PARTNER_ATTRIBUTION_ID,
		webhookId: serverEnv.PAYPAL_WEBHOOK_ID,
	};
	for (const [name, value] of Object.entries(required)) {
		if (!value) throw new Error(`PayPal is not configured (${name}).`);
	}
	return {
		...(required as Record<keyof typeof required, string>),
		environment: serverEnv.PAYPAL_ENVIRONMENT ?? "sandbox",
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
		const referral = await createPayPalSellerReferral(await config(), {
			trackingId,
			returnUrl: params.returnUrl,
		});
		return {
			account: account(`${trackingPrefix}${trackingId}`, false),
			onboardingUrl: referral.onboardingUrl,
		};
	},

	async getAccount(externalAccountId) {
		const paypal = await config();
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
		const created = await createPayPalOrder(await config(), {
			sellerMerchantId: sellerId(params.connectedAccountId),
			amountCents: params.amountCents,
			applicationFeeCents: params.applicationFeeCents,
			currency: params.currency,
			metadata: params.metadata,
		});
		return {
			externalPaymentId: created.orderId,
			nextAction: { type: "approval", token: created.orderId },
		};
	},

	async captureCharge(params) {
		const captured = await capturePayPalOrder(await config(), {
			sellerMerchantId: sellerId(params.connectedAccountId),
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
		const paypal = await config();
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

	async verifyWebhook(request) {
		const paypal = await config();
		if (!(await verifyPayPalWebhook(paypal, request))) return null;
		return parsePayPalWebhookEvent(JSON.parse(request.rawBody));
	},
};
