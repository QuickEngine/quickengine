export type PayPalEnvironment = "sandbox" | "live";

export type PayPalConfig = {
	clientId: string;
	clientSecret: string;
	partnerMerchantId: string;
	partnerAttributionId: string;
	webhookId: string;
	environment: PayPalEnvironment;
};

type PayPalFetch = typeof fetch;

export class PayPalApiError extends Error {
	constructor(
		readonly operation: string,
		readonly status: number,
	) {
		super(`PayPal ${operation} failed (${status}).`);
	}
}

const baseUrl = (environment: PayPalEnvironment) =>
	environment === "live"
		? "https://api-m.paypal.com"
		: "https://api-m.sandbox.paypal.com";

const cents = (amountCents: number): string => {
	if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
		throw new RangeError("PayPal amounts must be non-negative integer cents.");
	}
	return `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(2, "0")}`;
};

const encodeBasic = (clientId: string, clientSecret: string): string =>
	Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");

const base64Url = (value: unknown): string =>
	Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

/**
 * PayPal's documented third-party assertion is an unsigned JWT. It identifies
 * the seller; the OAuth bearer token still authenticates QuickEngine.
 */
export const payPalAuthAssertion = (
	clientId: string,
	sellerMerchantId: string,
): string =>
	`${base64Url({ alg: "none" })}.${base64Url({ iss: clientId, payer_id: sellerMerchantId })}.`;

async function json<T>(response: Response, operation: string): Promise<T> {
	if (!response.ok) throw new PayPalApiError(operation, response.status);
	return (await response.json()) as T;
}

export async function getPayPalAccessToken(
	config: PayPalConfig,
	fetcher: PayPalFetch = fetch,
): Promise<string> {
	const response = await fetcher(
		`${baseUrl(config.environment)}/v1/oauth2/token`,
		{
			method: "POST",
			headers: {
				Authorization: `Basic ${encodeBasic(config.clientId, config.clientSecret)}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: "grant_type=client_credentials",
		},
	);
	const body = await json<{ access_token?: string }>(
		response,
		"authentication",
	);
	if (!body.access_token) throw new PayPalApiError("authentication", 502);
	return body.access_token;
}

async function partnerHeaders(
	config: PayPalConfig,
	fetcher: PayPalFetch,
): Promise<Record<string, string>> {
	return {
		Authorization: `Bearer ${await getPayPalAccessToken(config, fetcher)}`,
		"Content-Type": "application/json",
		"PayPal-Partner-Attribution-Id": config.partnerAttributionId,
	};
}

export async function createPayPalSellerReferral(
	config: PayPalConfig,
	input: { trackingId: string; returnUrl: string },
	fetcher: PayPalFetch = fetch,
): Promise<{ trackingId: string; onboardingUrl: string }> {
	const response = await fetcher(
		`${baseUrl(config.environment)}/v2/customer/partner-referrals`,
		{
			method: "POST",
			headers: await partnerHeaders(config, fetcher),
			body: JSON.stringify({
				tracking_id: input.trackingId,
				partner_config_override: {
					return_url: input.returnUrl,
					return_url_description: "Return to QuickDash",
				},
				operations: [
					{
						operation: "API_INTEGRATION",
						api_integration_preference: {
							rest_api_integration: {
								integration_method: "PAYPAL",
								integration_type: "THIRD_PARTY",
								third_party_details: { features: ["PAYMENT", "REFUND"] },
							},
						},
					},
				],
				products: ["EXPRESS_CHECKOUT"],
				legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
			}),
		},
	);
	const body = await json<{ links?: Array<{ href?: string; rel?: string }> }>(
		response,
		"seller onboarding",
	);
	const onboardingUrl = body.links?.find(
		(link) => link.rel === "action_url",
	)?.href;
	if (!onboardingUrl) throw new PayPalApiError("seller onboarding", 502);
	return { trackingId: input.trackingId, onboardingUrl };
}

export type PayPalSellerStatus = {
	merchantId: string | null;
	paymentsReceivable: boolean;
	primaryEmailConfirmed: boolean;
};

export async function getPayPalSellerByTrackingId(
	config: PayPalConfig,
	trackingId: string,
	fetcher: PayPalFetch = fetch,
): Promise<PayPalSellerStatus> {
	const url = new URL(
		`${baseUrl(config.environment)}/v1/customer/partners/${encodeURIComponent(config.partnerMerchantId)}/merchant-integrations`,
	);
	url.searchParams.set("tracking_id", trackingId);
	const response = await fetcher(url, {
		headers: await partnerHeaders(config, fetcher),
	});
	const body = await json<{
		merchant_id?: string;
		payments_receivable?: boolean;
		primary_email_confirmed?: boolean;
	}>(response, "seller status");
	return {
		merchantId: body.merchant_id ?? null,
		paymentsReceivable: body.payments_receivable ?? false,
		primaryEmailConfirmed: body.primary_email_confirmed ?? false,
	};
}

export async function getPayPalSellerByMerchantId(
	config: PayPalConfig,
	merchantId: string,
	fetcher: PayPalFetch = fetch,
): Promise<PayPalSellerStatus> {
	const response = await fetcher(
		`${baseUrl(config.environment)}/v1/customer/partners/${encodeURIComponent(config.partnerMerchantId)}/merchant-integrations/${encodeURIComponent(merchantId)}`,
		{ headers: await partnerHeaders(config, fetcher) },
	);
	const body = await json<{
		merchant_id?: string;
		payments_receivable?: boolean;
		primary_email_confirmed?: boolean;
	}>(response, "seller status");
	return {
		merchantId: body.merchant_id ?? merchantId,
		paymentsReceivable: body.payments_receivable ?? false,
		primaryEmailConfirmed: body.primary_email_confirmed ?? false,
	};
}

export async function createPayPalOrder(
	config: PayPalConfig,
	input: {
		sellerMerchantId: string;
		amountCents: number;
		applicationFeeCents: number;
		currency: string;
		metadata?: Record<string, string>;
	},
	fetcher: PayPalFetch = fetch,
): Promise<{ orderId: string; approvalUrl: string }> {
	const headers = await partnerHeaders(config, fetcher);
	headers["PayPal-Auth-Assertion"] = payPalAuthAssertion(
		config.clientId,
		input.sellerMerchantId,
	);
	const paymentInstruction =
		input.applicationFeeCents > 0
			? {
					platform_fees: [
						{
							amount: {
								currency_code: input.currency.toUpperCase(),
								value: cents(input.applicationFeeCents),
							},
						},
					],
				}
			: undefined;
	const response = await fetcher(
		`${baseUrl(config.environment)}/v2/checkout/orders`,
		{
			method: "POST",
			headers,
			body: JSON.stringify({
				intent: "CAPTURE",
				purchase_units: [
					{
						custom_id: input.metadata?.orderId,
						payee: { merchant_id: input.sellerMerchantId },
						amount: {
							currency_code: input.currency.toUpperCase(),
							value: cents(input.amountCents),
						},
						payment_instruction: paymentInstruction,
					},
				],
			}),
		},
	);
	const body = await json<{
		id?: string;
		links?: Array<{ href?: string; rel?: string }>;
	}>(response, "order creation");
	const approvalUrl = body.links?.find((link) => link.rel === "approve")?.href;
	if (!body.id || !approvalUrl) throw new PayPalApiError("order creation", 502);
	return { orderId: body.id, approvalUrl };
}

export async function capturePayPalOrder(
	config: PayPalConfig,
	input: { sellerMerchantId: string; orderId: string },
	fetcher: PayPalFetch = fetch,
): Promise<{ captureId: string; settled: boolean }> {
	const headers = await partnerHeaders(config, fetcher);
	headers["PayPal-Auth-Assertion"] = payPalAuthAssertion(
		config.clientId,
		input.sellerMerchantId,
	);
	const response = await fetcher(
		`${baseUrl(config.environment)}/v2/checkout/orders/${encodeURIComponent(input.orderId)}/capture`,
		{ method: "POST", headers, body: "{}" },
	);
	const body = await json<{
		status?: string;
		purchase_units?: Array<{
			payments?: { captures?: Array<{ id?: string; status?: string }> };
		}>;
	}>(response, "order capture");
	const capture = body.purchase_units?.[0]?.payments?.captures?.[0];
	if (!capture?.id) throw new PayPalApiError("order capture", 502);
	return {
		captureId: capture.id,
		settled: body.status === "COMPLETED" && capture.status === "COMPLETED",
	};
}

export async function getPayPalOrderCapture(
	config: PayPalConfig,
	input: { sellerMerchantId: string; orderId: string },
	fetcher: PayPalFetch = fetch,
): Promise<{ captureId: string; currency: string }> {
	const headers = await partnerHeaders(config, fetcher);
	headers["PayPal-Auth-Assertion"] = payPalAuthAssertion(
		config.clientId,
		input.sellerMerchantId,
	);
	const response = await fetcher(
		`${baseUrl(config.environment)}/v2/checkout/orders/${encodeURIComponent(input.orderId)}`,
		{ headers },
	);
	const body = await json<{
		purchase_units?: Array<{
			payments?: {
				captures?: Array<{
					id?: string;
					amount?: { currency_code?: string };
				}>;
			};
		}>;
	}>(response, "order lookup");
	const capture = body.purchase_units?.[0]?.payments?.captures?.[0];
	if (!capture?.id || !capture.amount?.currency_code) {
		throw new PayPalApiError("order lookup", 502);
	}
	return { captureId: capture.id, currency: capture.amount.currency_code };
}

export async function refundPayPalCapture(
	config: PayPalConfig,
	input: {
		sellerMerchantId: string;
		captureId: string;
		amountCents?: number;
		currency?: string;
	},
	fetcher: PayPalFetch = fetch,
): Promise<{ refundId: string; settled: boolean }> {
	const headers = await partnerHeaders(config, fetcher);
	headers["PayPal-Auth-Assertion"] = payPalAuthAssertion(
		config.clientId,
		input.sellerMerchantId,
	);
	const response = await fetcher(
		`${baseUrl(config.environment)}/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`,
		{
			method: "POST",
			headers,
			body: JSON.stringify(
				input.amountCents === undefined
					? {}
					: {
							amount: {
								currency_code: input.currency?.toUpperCase(),
								value: cents(input.amountCents),
							},
						},
			),
		},
	);
	const body = await json<{ id?: string; status?: string }>(response, "refund");
	if (!body.id) throw new PayPalApiError("refund", 502);
	return { refundId: body.id, settled: body.status === "COMPLETED" };
}

export async function verifyPayPalWebhook(
	config: PayPalConfig,
	input: {
		rawBody: string;
		headers: Record<string, string | undefined>;
	},
	fetcher: PayPalFetch = fetch,
): Promise<boolean> {
	const body = JSON.parse(input.rawBody) as unknown;
	const response = await fetcher(
		`${baseUrl(config.environment)}/v1/notifications/verify-webhook-signature`,
		{
			method: "POST",
			headers: await partnerHeaders(config, fetcher),
			body: JSON.stringify({
				auth_algo: input.headers["paypal-auth-algo"],
				cert_url: input.headers["paypal-cert-url"],
				transmission_id: input.headers["paypal-transmission-id"],
				transmission_sig: input.headers["paypal-transmission-sig"],
				transmission_time: input.headers["paypal-transmission-time"],
				webhook_id: config.webhookId,
				webhook_event: body,
			}),
		},
	);
	const result = await json<{ verification_status?: string }>(
		response,
		"webhook verification",
	);
	return result.verification_status === "SUCCESS";
}
