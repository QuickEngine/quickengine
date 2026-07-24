import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const fulfillment = {
	id: "00000000-0000-4000-8000-0000000013a1",
	workspaceId: "workspace_123",
	title: "Ship the order",
	kind: "physical" as const,
	status: "pending" as const,
	clientId: null,
	clientName: null,
	invoiceId: null,
	paymentId: null,
	sourceModule: "orders",
	sourceRecordId: "00000000-0000-4000-8000-0000000012a1",
	instructions: null,
	details: {},
	dueAt: null,
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = () => {
	const fetcher = vi
		.fn<typeof fetch>()
		.mockResolvedValue(
			new Response(JSON.stringify({ data: fulfillment }), { status: 200 }),
		);
	const quick = createQuickServer({
		baseUrl: "https://api.quickengine.test",
		workspaceId: "workspace_123",
		credential: { type: "secret", token: "qsk_abc" },
		fetcher,
	});
	return { quick, fetcher };
};

describe("fulfillments resource", () => {
	it("lists deliveries as a cursor page over GET /v1/fulfillments", async () => {
		const page = {
			items: [fulfillment],
			page: { hasMore: false, nextCursor: null },
		};
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ data: page, meta: { requestId: "req_f" } }),
					{ status: 200, headers: { "Request-Id": "req_f" } },
				),
			);
		const quick = createQuickServer({
			baseUrl: "https://api.quickengine.test",
			workspaceId: "workspace_123",
			credential: { type: "secret", token: "qsk_abc" },
			fetcher,
		});

		const result = await quick.fulfillments.list({ status: "pending" });

		expect(result).toEqual({ data: page, requestId: "req_f" });
		const [url] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			"https://api.quickengine.test/v1/fulfillments?status=pending",
		);
	});

	it("opens a delivery with an idempotency key", async () => {
		const { quick, fetcher } = server();
		await quick.fulfillments.create(
			{ title: "Ship the order", kind: "physical" },
			"fulfillment-create-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/fulfillments");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"fulfillment-create-1",
		);
	});

	it("moves status over POST /v1/fulfillments/:id/status", async () => {
		const { quick, fetcher } = server();
		await quick.fulfillments.setStatus(
			fulfillment.id,
			"fulfilled",
			"fulfillment-status-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/fulfillments/${fulfillment.id}/status`,
		);
		expect(JSON.parse(String(init?.body))).toEqual({ status: "fulfilled" });
	});
});
