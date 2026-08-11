import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const payment = {
	id: "00000000-0000-4000-8000-0000000011a1",
	workspaceId: "workspace_123",
	invoiceId: null,
	clientId: null,
	amountCents: 10_000,
	applicationFeeCents: 0,
	currency: "USD",
	status: "succeeded" as const,
	provider: "stripe",
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = () => {
	const fetcher = vi
		.fn<typeof fetch>()
		.mockImplementation(
			async () =>
				new Response(JSON.stringify({ data: payment }), { status: 200 }),
		);
	const quick = createQuickServer({
		baseUrl: "https://api.quickengine.test",
		workspaceId: "workspace_123",
		credential: { type: "secret", token: "qsk_abc" },
		fetcher,
	});
	return { quick, fetcher };
};

describe("payments resource", () => {
	it("records a payment with an idempotency key", async () => {
		const { quick, fetcher } = server();
		await quick.payments.record({ amountCents: 10_000 }, "payment-record-1");
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/payments");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"payment-record-1",
		);
	});

	it("refunds over POST /v1/payments/:id/refund", async () => {
		const { quick, fetcher } = server();
		await quick.payments.refund(
			payment.id,
			{ amountCents: 4_000 },
			"payment-refund-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/payments/${payment.id}/refund`,
		);
		expect(JSON.parse(String(init?.body))).toEqual({ amountCents: 4_000 });
	});

	it("reads and refreshes one explicit provider connection", async () => {
		const { quick, fetcher } = server();
		await quick.payments.connection("stripe");
		await quick.payments.refreshConnection("stripe");

		expect(fetcher.mock.calls[0]?.[0]).toBe(
			"https://api.quickengine.test/v1/payments/connect?provider=stripe",
		);
		expect(fetcher.mock.calls[1]?.[0]).toBe(
			"https://api.quickengine.test/v1/payments/connect/refresh?provider=stripe",
		);
		expect(fetcher.mock.calls[1]?.[1]?.method).toBe("POST");
	});

	it("starts hosted provider onboarding with trusted return locations", async () => {
		const { quick, fetcher } = server();
		const input = {
			provider: "stripe" as const,
			returnUrl: "https://quickdash.xyz/workspace/payments?connected=1",
			refreshUrl: "https://quickdash.xyz/workspace/payments?refresh=1",
		};
		await quick.payments.startOnboarding(input);

		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			"https://api.quickengine.test/v1/payments/connect/onboard",
		);
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual(input);
	});

	it("changes the default provider explicitly", async () => {
		const { quick, fetcher } = server();
		await quick.payments.setDefaultProvider("paypal");

		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			"https://api.quickengine.test/v1/payments/connect/default",
		);
		expect(init?.method).toBe("PUT");
		expect(JSON.parse(String(init?.body))).toEqual({ provider: "paypal" });
	});
});
