import { describe, expect, it, vi } from "vitest";
import { createQuickServer } from "../index";

const shipment = {
	id: "00000000-0000-4000-8000-0000000015a1",
	workspaceId: "workspace_123",
	orderId: "00000000-0000-4000-8000-0000000015c1",
	fulfillmentId: "00000000-0000-4000-8000-0000000015e1",
	status: "draft" as const,
	destination: {
		recipientName: "Ada Lovelace",
		line1: "12 Analytical Way",
		city: "London",
		countryCode: "GB",
	},
	carrier: null,
	serviceLevel: null,
	trackingNumber: null,
	trackingUrl: null,
	createdAt: "2026-07-24T00:00:00.000Z",
	updatedAt: "2026-07-24T00:00:00.000Z",
};

const server = (payload: unknown = shipment) => {
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

describe("shipments resource", () => {
	it("filters a cursor page by order over GET /v1/shipments", async () => {
		const { quick, fetcher } = server({
			items: [shipment],
			page: { hasMore: false, nextCursor: null },
		});

		await quick.shipments.list({ orderId: shipment.orderId, status: "draft" });

		const [url] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/shipments?orderId=${shipment.orderId}&status=draft`,
		);
	});

	it("creates a shipment with an idempotency key", async () => {
		const { quick, fetcher } = server();
		await quick.shipments.create(
			{
				orderId: shipment.orderId,
				destination: shipment.destination,
				lines: [
					{
						orderLineItemId: "00000000-0000-4000-8000-0000000015d1",
						quantity: 2,
					},
				],
				parcels: [{ weightGrams: 500 }],
			},
			"shipment-create-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe("https://api.quickengine.test/v1/shipments");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
			"shipment-create-1",
		);
	});

	it("carries requireTracking through to the status route", async () => {
		const { quick, fetcher } = server();
		await quick.shipments.setStatus(shipment.id, "shipped", "shipment-ship-1", {
			requireTracking: true,
		});
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/shipments/${shipment.id}/status`,
		);
		expect(JSON.parse(String(init?.body))).toEqual({
			status: "shipped",
			requireTracking: true,
		});
	});

	it("updates tracking over POST /v1/shipments/:id/tracking", async () => {
		const { quick, fetcher } = server();
		await quick.shipments.updateTracking(
			shipment.id,
			{ carrier: "Royal Mail", trackingNumber: "RM123" },
			"shipment-track-1",
		);
		const [url, init] = fetcher.mock.calls[0] ?? [];
		expect(url).toBe(
			`https://api.quickengine.test/v1/shipments/${shipment.id}/tracking`,
		);
		expect(JSON.parse(String(init?.body))).toEqual({
			carrier: "Royal Mail",
			trackingNumber: "RM123",
		});
	});
});
