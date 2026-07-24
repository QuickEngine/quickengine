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
		.mockResolvedValue(
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
});
