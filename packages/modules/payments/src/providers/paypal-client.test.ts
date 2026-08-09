import { describe, expect, it, vi } from "vitest";
import {
	capturePayPalOrder,
	createPayPalOrder,
	createPayPalSellerReferral,
	getPayPalSellerByTrackingId,
	type PayPalConfig,
	payPalAuthAssertion,
	refundPayPalCapture,
	verifyPayPalWebhook,
} from "./paypal-client";

const config: PayPalConfig = {
	clientId: "client-id",
	clientSecret: "client-secret",
	partnerMerchantId: "PARTNER123",
	partnerAttributionId: "QuickEngine_SP_PPCP",
	webhookId: "WH-123",
	environment: "sandbox",
};

const response = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

const fetchSequence = (...bodies: unknown[]) => {
	const fetcher = vi.fn<typeof fetch>();
	for (const body of bodies) fetcher.mockResolvedValueOnce(response(body));
	return fetcher;
};

describe("PayPal platform client", () => {
	it("creates a seller referral with payment and refund permissions", async () => {
		const fetcher = fetchSequence(
			{ access_token: "token" },
			{
				links: [
					{ rel: "action_url", href: "https://sandbox.paypal.com/onboard" },
				],
			},
		);
		await expect(
			createPayPalSellerReferral(
				config,
				{
					trackingId: "workspace-123",
					returnUrl: "https://account.quickdash.xyz/payments",
				},
				fetcher,
			),
		).resolves.toEqual({
			trackingId: "workspace-123",
			onboardingUrl: "https://sandbox.paypal.com/onboard",
		});
		const request = fetcher.mock.calls[1]?.[1];
		const body = JSON.parse(String(request?.body));
		expect(
			body.operations[0].api_integration_preference.rest_api_integration
				.third_party_details.features,
		).toEqual(["PAYMENT", "REFUND"]);
	});

	it("resolves the seller merchant id from its stable tracking id", async () => {
		const fetcher = fetchSequence(
			{ access_token: "token" },
			{
				merchant_id: "SELLER123",
				payments_receivable: true,
				primary_email_confirmed: true,
			},
		);
		await expect(
			getPayPalSellerByTrackingId(config, "workspace-123", fetcher),
		).resolves.toEqual({
			merchantId: "SELLER123",
			paymentsReceivable: true,
			primaryEmailConfirmed: true,
		});
		expect(String(fetcher.mock.calls[1]?.[0])).toContain(
			"tracking_id=workspace-123",
		);
	});

	it("creates a seller-owned order using exact integer-cent formatting", async () => {
		const fetcher = fetchSequence(
			{ access_token: "token" },
			{
				id: "ORDER123",
				links: [
					{
						rel: "approve",
						href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123",
					},
				],
			},
		);
		await expect(
			createPayPalOrder(
				config,
				{
					sellerMerchantId: "SELLER123",
					amountCents: 10_001,
					applicationFeeCents: 0,
					currency: "usd",
					metadata: { orderId: "quick-order" },
				},
				fetcher,
			),
		).resolves.toEqual({
			orderId: "ORDER123",
			approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123",
		});
		const request = fetcher.mock.calls[1]?.[1];
		const body = JSON.parse(String(request?.body));
		expect(body.purchase_units[0]).toMatchObject({
			custom_id: "quick-order",
			payee: { merchant_id: "SELLER123" },
			amount: { currency_code: "USD", value: "100.01" },
		});
		expect(request?.headers).toMatchObject({
			"PayPal-Auth-Assertion": payPalAuthAssertion("client-id", "SELLER123"),
		});
	});

	it("refuses an order response that cannot send the shopper to approval", async () => {
		const fetcher = fetchSequence(
			{ access_token: "token" },
			{ id: "ORDER123", links: [] },
		);
		await expect(
			createPayPalOrder(
				config,
				{
					sellerMerchantId: "SELLER123",
					amountCents: 2_400,
					applicationFeeCents: 0,
					currency: "cad",
				},
				fetcher,
			),
		).rejects.toMatchObject({
			operation: "order creation",
			status: 502,
		});
	});

	it("captures an approved order and reports settlement honestly", async () => {
		const fetcher = fetchSequence(
			{ access_token: "token" },
			{
				status: "COMPLETED",
				purchase_units: [
					{
						payments: { captures: [{ id: "CAPTURE123", status: "COMPLETED" }] },
					},
				],
			},
		);
		await expect(
			capturePayPalOrder(
				config,
				{ sellerMerchantId: "SELLER123", orderId: "ORDER123" },
				fetcher,
			),
		).resolves.toEqual({ captureId: "CAPTURE123", settled: true });
	});

	it("refunds a capture without inventing an amount for a full refund", async () => {
		const fetcher = fetchSequence(
			{ access_token: "token" },
			{ id: "REFUND123", status: "PENDING" },
		);
		await expect(
			refundPayPalCapture(
				config,
				{ sellerMerchantId: "SELLER123", captureId: "CAPTURE123" },
				fetcher,
			),
		).resolves.toEqual({ refundId: "REFUND123", settled: false });
		expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({});
	});

	it("asks PayPal to verify the exact event and transmission headers", async () => {
		const fetcher = fetchSequence(
			{ access_token: "token" },
			{ verification_status: "SUCCESS" },
		);
		await expect(
			verifyPayPalWebhook(
				config,
				{
					rawBody: '{"id":"WH-EVENT"}',
					headers: {
						"paypal-auth-algo": "SHA256withRSA",
						"paypal-cert-url": "https://api.paypal.com/cert",
						"paypal-transmission-id": "transmission",
						"paypal-transmission-sig": "signature",
						"paypal-transmission-time": "2026-08-04T00:00:00Z",
					},
				},
				fetcher,
			),
		).resolves.toBe(true);
		const body = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
		expect(body).toMatchObject({
			webhook_id: "WH-123",
			transmission_id: "transmission",
			webhook_event: { id: "WH-EVENT" },
		});
	});
});
