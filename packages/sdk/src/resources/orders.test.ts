import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const order = {
	id: "00000000-0000-4000-8000-0000000012a1",
	workspaceId: "workspace_123",
	number: "ORD-0001",
	status: "draft" as const,
	clientId: "00000000-0000-4000-8000-0000000012b1",
	clientName: "Ordering Client",
	clientEmail: "client@example.com",
	fulfillmentId: null,
	currency: "USD",
	subtotalCents: 5_000,
	totalCents: 5_000,
	notes: null,
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = () => {
	const fetcher = vi
		.fn<typeof fetch>()
		.mockResolvedValue(
			new Response(JSON.stringify({ data: order }), { status: 200 }),
		);
	const quick = createQuickServer({
		baseUrl: "https://api.quickengine.test",
		workspaceId: "workspace_123",
		credential: { type: "secret", token: "qsk_abc" },
		fetcher,
	});
	return { quick, fetcher };
};

describe("orders resource", () => {
	it("lists orders as a cursor page over GET /v1/orders", async () => {
		const page = {
			items: [order],
			page: { hasMore: false, nextCursor: null },
		};
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ data: page, meta: { requestId: "req_o" } }),
					{ status: 200, headers: { "Request-Id": "req_o" } },
				),
			);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "secret", token: "qsk_abc" },
			fetcher,
		});

		const result = await quick.orders.list({ status: "placed" });

		expect(result).toEqual({ data: page, requestId: "req_o" });
		const [url] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/orders?status=placed");
	});

	it("creates an order with an idempotency key", async () => {
		const { quick, fetcher } = server();
		await quick.orders.create(
			{
				clientId: order.clientId,
				lines: [
					{
						name: "Business Cards",
						type: "physical",
						quantity: 2,
						unitPriceCents: 2_500,
					},
				],
			},
			"order-create-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/orders");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"order-create-1",
		);
	});

	it("moves status over POST /v1/orders/:id/status", async () => {
		const { quick, fetcher } = server();
		await quick.orders.setStatus(order.id, "placed", "order-status-1");
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/orders/${order.id}/status`,
		);
		expect(JSON.parse(String(init?.body))).toEqual({ status: "placed" });
	});

	it("opens fulfillment over POST /v1/orders/:id/fulfillment", async () => {
		const { quick, fetcher } = server();
		await quick.orders.ensureFulfillment(order.id, "order-fulfillment-1");
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/orders/${order.id}/fulfillment`,
		);
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"order-fulfillment-1",
		);
	});
});
