import { testDbClient } from "@quickengine/db/testing";
import { setFulfillmentStatus } from "@quickengine/mod-fulfillment";
import {
	createOrder,
	ensureOrderFulfillment,
	getOrder,
	setOrderStatus,
} from "@quickengine/mod-orders";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "ord-owner";
const workspaceId = "00000000-0000-4000-8000-0000000d0001";
const clientId = "00000000-0000-4000-8000-0000000d0002";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Ord Owner', 'ord@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Ord Workspace', 'ecommerce')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com', 'Analytical Engines')
	`;
});

async function confirmedOrder() {
	const order = await createOrder(workspaceId, {
		clientId,
		currency: "USD",
		lines: [
			{
				name: "Consulting",
				type: "service",
				quantity: 1,
				unitPriceCents: 16_000,
			},
		],
	});
	await setOrderStatus(workspaceId, order.id, "placed");
	await setOrderStatus(workspaceId, order.id, "confirmed");
	return order;
}

describe("Orders → Fulfillment bridge", () => {
	it("creates one delivery per order and gates 'fulfilled' on the delivery", async () => {
		const order = await confirmedOrder();

		// Creates exactly one pending fulfillment, idempotently.
		const fulfillmentId = await ensureOrderFulfillment(workspaceId, order.id);
		expect(await ensureOrderFulfillment(workspaceId, order.id)).toBe(
			fulfillmentId,
		);
		expect((await getOrder(workspaceId, order.id))?.fulfillmentId).toBe(
			fulfillmentId,
		);

		// The order cannot be marked fulfilled while its delivery is still pending.
		await setOrderStatus(workspaceId, order.id, "processing");
		await expect(
			setOrderStatus(workspaceId, order.id, "fulfilled"),
		).rejects.toThrow("ORDER_FULFILLMENT_NOT_COMPLETE");

		// Complete the delivery, then the order may be fulfilled.
		await setFulfillmentStatus(workspaceId, fulfillmentId, "fulfilled");
		const fulfilled = await setOrderStatus(workspaceId, order.id, "fulfilled");
		expect(fulfilled.status).toBe("fulfilled");
	});

	it("cancelling an order cancels its still-pending delivery", async () => {
		const order = await confirmedOrder();
		const fulfillmentId = await ensureOrderFulfillment(workspaceId, order.id);

		await setOrderStatus(workspaceId, order.id, "cancelled");

		const sql = testDbClient();
		const [fulfillment] = await sql<{ status: string }[]>`
			select status from fulfillments where id = ${fulfillmentId}
		`;
		expect(fulfillment.status).toBe("cancelled");
	});
});
