import { testDbClient } from "@quickengine/db/testing";
import { createOrder, getOrder, setOrderStatus } from "@quickengine/mod-orders";
import { createShipment, setShipmentStatus } from "@quickengine/mod-shipping";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "ship-owner";
const workspaceId = "00000000-0000-4000-8000-0000000c0001";
const clientId = "00000000-0000-4000-8000-0000000c0002";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Ship Owner', 'ship@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Ship Workspace', 'ecommerce')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com', 'Analytical Engines')
	`;
});

async function confirmedPhysicalOrder() {
	const order = await createOrder(workspaceId, {
		clientId,
		currency: "USD",
		lines: [
			{ name: "Widget", type: "physical", quantity: 3, unitPriceCents: 5_000 },
		],
	});
	await setOrderStatus(workspaceId, order.id, "placed");
	await setOrderStatus(workspaceId, order.id, "confirmed");
	const detailed = await getOrder(workspaceId, order.id);
	return { orderId: order.id, orderLineItemId: detailed?.lines[0]?.id ?? "" };
}

const destination = {
	recipientName: "Ada Lovelace",
	line1: "1 Analytical Way",
	city: "London",
	countryCode: "GB",
};

async function fulfillmentStatus(fulfillmentId: string): Promise<string> {
	const sql = testDbClient();
	const [row] = await sql<{ status: string }[]>`
		select status from fulfillments where id = ${fulfillmentId}
	`;
	return row?.status ?? "missing";
}

describe("Shipping → Fulfillment bridge", () => {
	it("ships part of an order, blocks over-allocation, and syncs delivery state", async () => {
		const { orderId, orderLineItemId } = await confirmedPhysicalOrder();

		// Ship 2 of the 3 units — the shipment owns its own fulfillment (pending).
		const shipment = await createShipment(workspaceId, {
			orderId,
			lines: [{ orderLineItemId, quantity: 2 }],
			destination,
			parcels: [{ weightGrams: 500 }],
		});
		expect(shipment.fulfillmentId).not.toBeNull();
		expect(await fulfillmentStatus(shipment.fulfillmentId)).toBe("pending");

		// Over-allocation is blocked: 2 already allocated + 2 more > 3 ordered.
		await expect(
			createShipment(workspaceId, {
				orderId,
				lines: [{ orderLineItemId, quantity: 2 }],
				destination,
				parcels: [{ weightGrams: 500 }],
			}),
		).rejects.toThrow("ORDER_LINE_OVERSHIPPED");

		// Shipment state syncs into the fulfillment: shipped → in_progress.
		await setShipmentStatus(workspaceId, shipment.id, "ready");
		await setShipmentStatus(workspaceId, shipment.id, "shipped");
		expect(await fulfillmentStatus(shipment.fulfillmentId)).toBe("in_progress");

		// Delivered → fulfilled.
		await setShipmentStatus(workspaceId, shipment.id, "delivered");
		expect(await fulfillmentStatus(shipment.fulfillmentId)).toBe("fulfilled");
	});
});
