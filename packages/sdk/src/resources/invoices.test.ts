import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const invoice = {
	id: "00000000-0000-4000-8000-0000000010a1",
	workspaceId: "workspace_123",
	number: "INV-0001",
	status: "draft" as const,
	clientId: null,
	clientName: null,
	currency: "USD",
	subtotalCents: 50_000,
	taxCents: 0,
	totalCents: 50_000,
	notes: null,
	dueAt: null,
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = () => {
	const fetcher = vi
		.fn<typeof fetch>()
		.mockResolvedValue(
			new Response(JSON.stringify({ data: invoice }), { status: 200 }),
		);
	const quick = createQuickServer({
		baseUrl: "https://api.quickengine.test",
		workspaceId: "workspace_123",
		credential: { type: "secret", token: "qsk_abc" },
		fetcher,
	});
	return { quick, fetcher };
};

describe("invoices resource", () => {
	it("lists invoices as a cursor page over GET /v1/invoices", async () => {
		const page = {
			items: [invoice],
			page: { hasMore: false, nextCursor: null },
		};
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ data: page, meta: { requestId: "req_i" } }),
					{ status: 200, headers: { "Request-Id": "req_i" } },
				),
			);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "secret", token: "qsk_abc" },
			fetcher,
		});

		const result = await quick.invoices.list({ status: "paid" });

		expect(result).toEqual({ data: page, requestId: "req_i" });
		const [url] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/invoices?status=paid");
	});

	it("creates an invoice with an idempotency key", async () => {
		const { quick, fetcher } = server();
		await quick.invoices.create(
			{
				lineItems: [
					{ description: "Work", quantity: 1, unitPriceCents: 50_000 },
				],
			},
			"invoice-create-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/invoices");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"invoice-create-1",
		);
	});

	it("moves status over POST /v1/invoices/:id/status", async () => {
		const { quick, fetcher } = server();
		await quick.invoices.setStatus(invoice.id, "sent", "invoice-status-1");
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/invoices/${invoice.id}/status`,
		);
		expect(JSON.parse(String(init?.body))).toEqual({ status: "sent" });
	});
});
