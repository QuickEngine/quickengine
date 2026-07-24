import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const quote = {
	id: "00000000-0000-4000-8000-0000000009a1",
	workspaceId: "workspace_123",
	number: "Q-0001",
	kind: "quote" as const,
	title: "Website build",
	status: "draft" as const,
	clientId: "00000000-0000-4000-8000-0000000009c1",
	clientName: "Acme Co",
	currency: "USD",
	subtotalCents: 50_000,
	taxCents: 0,
	totalCents: 50_000,
	validUntil: null,
	notes: null,
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = () => {
	const fetcher = vi
		.fn<typeof fetch>()
		.mockResolvedValue(
			new Response(JSON.stringify({ data: quote }), { status: 200 }),
		);
	const quick = createQuickServer({
		baseUrl: "https://api.quickengine.test",
		workspaceId: "workspace_123",
		credential: { type: "secret", token: "qsk_abc" },
		fetcher,
	});
	return { quick, fetcher };
};

describe("quotes resource", () => {
	it("lists quotes as a cursor page over GET /v1/quotes", async () => {
		const page = { items: [quote], page: { hasMore: false, nextCursor: null } };
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ data: page, meta: { requestId: "req_q" } }),
					{ status: 200, headers: { "Request-Id": "req_q" } },
				),
			);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "secret", token: "qsk_abc" },
			fetcher,
		});

		const result = await quick.quotes.list({ status: "sent" });

		expect(result).toEqual({ data: page, requestId: "req_q" });
		const [url] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/quotes?status=sent");
	});

	it("creates a quote with an idempotency key", async () => {
		const { quick, fetcher } = server();
		await quick.quotes.create(
			{
				clientId: quote.clientId,
				title: "Website build",
				lines: [{ name: "Design", quantity: 1, unitPriceCents: 50_000 }],
			},
			"quote-create-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/quotes");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"quote-create-1",
		);
	});

	it("converts a quote to an invoice over POST /v1/quotes/:id/convert", async () => {
		const { quick, fetcher } = server();
		await quick.quotes.convert(quote.id, "invoice", "quote-convert-1");
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/quotes/${quote.id}/convert`,
		);
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({ target: "invoice" });
	});
});
