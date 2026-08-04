import { describe, expect, it, vi } from "vitest";
import { loadCustomerOrderDetail } from "./customer-routes";

const WORKSPACE_ID = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORDER_ID = "bbbbbbbb-0000-4000-8000-00000000000b";

const order = {
	id: ORDER_ID,
	workspaceId: WORKSPACE_ID,
	clientId: "client_owner",
	lineItems: [],
} as never;

describe("customer order detail", () => {
	it("returns the owned order with its safe payment and shipment summary", async () => {
		const result = await loadCustomerOrderDetail(
			{
				workspaceId: WORKSPACE_ID,
				clientRecordId: "client_owner",
				orderId: ORDER_ID,
			},
			{
				getOrder: vi.fn().mockResolvedValue(order),
				getPayment: vi.fn().mockResolvedValue({ status: "succeeded" }),
				getShipments: vi.fn().mockResolvedValue([
					{
						id: "shipment_1",
						status: "in_transit",
						carrier: "Canada Post",
						serviceLevel: "tracked",
						trackingNumber: "TRACK123",
						trackingUrl: "https://carrier.test/TRACK123",
						shippedAt: new Date("2026-08-01T00:00:00.000Z"),
						inTransitAt: null,
						deliveredAt: null,
					},
				]),
			},
		);

		expect(result).toMatchObject({
			id: ORDER_ID,
			payment: { status: "succeeded" },
			shipments: [{ trackingNumber: "TRACK123" }],
		});
	});

	it("never reads payment or shipment state for another customer's order", async () => {
		const getPayment = vi.fn();
		const getShipments = vi.fn();

		const result = await loadCustomerOrderDetail(
			{
				workspaceId: WORKSPACE_ID,
				clientRecordId: "client_attacker",
				orderId: ORDER_ID,
			},
			{
				getOrder: vi.fn().mockResolvedValue(order),
				getPayment,
				getShipments,
			},
		);

		expect(result).toBeNull();
		expect(getPayment).not.toHaveBeenCalled();
		expect(getShipments).not.toHaveBeenCalled();
	});
});
