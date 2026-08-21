import { describe, expect, it, vi } from "vitest";
import { loadOperatorOrderDetail } from "./orders-routes";

const WORKSPACE_ID = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORDER_ID = "bbbbbbbb-0000-4000-8000-00000000000b";

describe("operator order detail", () => {
	it("combines the order with settlement, refunds and shipment progress", async () => {
		const result = await loadOperatorOrderDetail(WORKSPACE_ID, ORDER_ID, {
			getOrder: vi.fn().mockResolvedValue({
				id: ORDER_ID,
				workspaceId: WORKSPACE_ID,
				lineItems: [{ id: "line_1", name: "Process House", quantity: 3 }],
			}),
			getPayment: vi.fn().mockResolvedValue({
				status: "refunded",
				refunds: [{ id: "refund_1", amountCents: 3_600 }],
			}),
			// Two of the three already went out, so the detail should report one
			// still outstanding rather than repeating what was ordered.
			getShipped: vi.fn().mockResolvedValue({ line_1: 2 }),
			getShipments: vi.fn().mockResolvedValue([
				{
					id: "shipment_1",
					status: "in_transit",
					carrier: "Canada Post",
					serviceLevel: "tracked",
					trackingNumber: "TRACK123",
					trackingUrl: "https://carrier.test/TRACK123",
					createdAt: new Date("2026-08-14T00:00:00.000Z"),
					shippedAt: new Date("2026-08-14T01:00:00.000Z"),
					inTransitAt: null,
					deliveredAt: null,
				},
			]),
		} as never);

		expect(result).toMatchObject({
			id: ORDER_ID,
			// 🔴 What is still OWED, not just what was ordered. Without this a
			// fulfilment screen cannot tell a fully shipped order from an untouched
			// one, and offers to send goods that already went.
			lineItems: [
				{
					name: "Process House",
					quantity: 3,
					shippedQuantity: 2,
					outstandingQuantity: 1,
				},
			],
			payment: {
				status: "refunded",
				refunds: [{ amountCents: 3_600 }],
			},
			shipments: [
				{
					status: "in_transit",
					trackingNumber: "TRACK123",
					shippedAt: "2026-08-14T01:00:00.000Z",
				},
			],
		});
	});

	it("does not query related records when the order does not exist", async () => {
		const getPayment = vi.fn();
		const getShipments = vi.fn();
		const result = await loadOperatorOrderDetail(WORKSPACE_ID, ORDER_ID, {
			getOrder: vi.fn().mockResolvedValue(null),
			getPayment,
			getShipments,
			getShipped: vi.fn(),
		} as never);

		expect(result).toBeNull();
		expect(getPayment).not.toHaveBeenCalled();
		expect(getShipments).not.toHaveBeenCalled();
	});
});
