import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const item = {
	id: "00000000-0000-4000-8000-0000000014a1",
	workspaceId: "workspace_123",
	catalogItemId: "00000000-0000-4000-8000-0000000014b1",
	catalogItemVariantId: null,
	status: "active" as const,
	onHand: 10,
	reserved: 0,
	lowStockThreshold: 2,
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = (payload: unknown = item) => {
	const fetcher = vi
		.fn<typeof fetch>()
		.mockResolvedValue(
			new Response(JSON.stringify({ data: payload }), { status: 200 }),
		);
	const quick = createQuickServer({
		baseUrl: "https://api.quickengine.test",
		workspaceId: "workspace_123",
		credential: { type: "secret", token: "qsk_abc" },
		fetcher,
	});
	return { quick, fetcher };
};

describe("inventory resource", () => {
	it("lists stock records as a cursor page over GET /v1/inventory", async () => {
		const page = { items: [item], page: { hasMore: false, nextCursor: null } };
		const { quick, fetcher } = server(page);

		await quick.inventory.list({ status: "active", limit: 50 });

		const [url] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			"https://api.quickengine.test/v1/inventory?limit=50&status=active",
		);
	});

	it("records a movement over POST /v1/inventory/:id/adjustments", async () => {
		const { quick, fetcher } = server();
		await quick.inventory.adjust(
			item.id,
			{ kind: "receive", quantity: 10 },
			"inventory-adjust-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/inventory/${item.id}/adjustments`,
		);
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({
			kind: "receive",
			quantity: 10,
		});
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"inventory-adjust-1",
		);
	});

	it("carries a business-level replay key alongside the request key", async () => {
		const { quick, fetcher } = server();
		await quick.inventory.adjust(
			item.id,
			{ kind: "sale", quantity: 1, idempotencyKey: "shipment-42" },
			"inventory-adjust-2",
		);
		const [, init] = fetcher.mock.calls[0] ?? [];
		// The two keys are independent: one guards the HTTP retry, the other the real event.
		expect(JSON.parse(String(init?.body)).idempotencyKey).toBe("shipment-42");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"inventory-adjust-2",
		);
	});

	it("reads movement history over GET /v1/inventory/:id/adjustments", async () => {
		const { quick, fetcher } = server({ items: [] });
		await quick.inventory.listAdjustments(item.id, { limit: 5 });
		const [url] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/inventory/${item.id}/adjustments?limit=5`,
		);
	});
});
