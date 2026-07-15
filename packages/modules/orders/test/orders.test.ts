import { testDbClient } from "@quickengine/db/testing";
import {
	getFulfillment,
	setFulfillmentStatus,
} from "@quickengine/mod-fulfillment";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createOrder,
	deleteOrder,
	ensureOrderFulfillment,
	getOrder,
	listOrders,
	setOrderStatus,
	updateDraftOrder,
} from "../src";

const ownerId = "orders-owner";
const workspaceId = "00000000-0000-4000-8000-000000000701";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000702";
const clientId = "00000000-0000-4000-8000-000000000703";
const otherClientId = "00000000-0000-4000-8000-000000000704";
const itemId = "00000000-0000-4000-8000-000000000705";

const input = {
	clientId,
	currency: "USD",
	lines: [
		{
			catalogItemId: itemId,
			name: "Printed cards",
			type: "physical" as const,
			sku: "CARDS",
			quantity: 2,
			unitPriceCents: 1500,
		},
	],
};

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'Orders Owner', 'orders@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Orders', 'retail'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'retail')`;
	await sql`insert into client_records (id, workspace_id, name, email) values (${clientId}, ${workspaceId}, 'Buyer', 'buyer@example.com'), (${otherClientId}, ${otherWorkspaceId}, 'Other Buyer', 'other@example.com')`;
	await sql`insert into catalog_items (id, workspace_id, name, type, status, sku, pricing_model, price_cents, currency) values (${itemId}, ${workspaceId}, 'Printed cards', 'physical', 'active', 'CARDS', 'fixed', 1500, 'USD')`;
});

describe("Orders persistence", () => {
	it("creates deterministic snapshots and isolates tenant reads", async () => {
		const order = await createOrder(workspaceId, input);
		const detail = await getOrder(workspaceId, order.id);
		expect(detail).toMatchObject({
			number: "ORD-0001",
			clientName: "Buyer",
			totalCents: 3000,
		});
		expect(detail?.lines[0]).toMatchObject({
			name: "Printed cards",
			lineTotalCents: 3000,
		});
		expect(await getOrder(otherWorkspaceId, order.id)).toBeUndefined();
		expect(await listOrders(otherWorkspaceId)).toEqual([]);
	});

	it("rejects cross-workspace clients and locks edits after placement", async () => {
		await expect(
			createOrder(workspaceId, { ...input, clientId: otherClientId }),
		).rejects.toThrow("CLIENT_WORKSPACE_MISMATCH");
		const order = await createOrder(workspaceId, input);
		await setOrderStatus(workspaceId, order.id, "placed");
		await expect(
			updateDraftOrder(workspaceId, order.id, input),
		).rejects.toThrow("ORDER_NOT_EDITABLE");
		await expect(deleteOrder(workspaceId, order.id)).rejects.toThrow(
			"ORDER_NOT_DELETABLE",
		);
	});

	it("creates fulfillment once and requires completed delivery", async () => {
		const order = await createOrder(workspaceId, input);
		await setOrderStatus(workspaceId, order.id, "placed");
		await setOrderStatus(workspaceId, order.id, "confirmed");
		const fulfillmentId = await ensureOrderFulfillment(workspaceId, order.id);
		expect(await ensureOrderFulfillment(workspaceId, order.id)).toBe(
			fulfillmentId,
		);
		await setOrderStatus(workspaceId, order.id, "processing");
		await expect(
			setOrderStatus(workspaceId, order.id, "fulfilled"),
		).rejects.toThrow("ORDER_FULFILLMENT_NOT_COMPLETE");
		await setFulfillmentStatus(workspaceId, fulfillmentId, "fulfilled");
		expect(
			(await setOrderStatus(workspaceId, order.id, "fulfilled")).status,
		).toBe("fulfilled");
	});

	it("cancels active fulfillment with its order", async () => {
		const order = await createOrder(workspaceId, input);
		await setOrderStatus(workspaceId, order.id, "placed");
		await setOrderStatus(workspaceId, order.id, "confirmed");
		const fulfillmentId = await ensureOrderFulfillment(workspaceId, order.id);
		await setOrderStatus(workspaceId, order.id, "cancelled");
		expect((await getFulfillment(workspaceId, fulfillmentId))?.status).toBe(
			"cancelled",
		);
	});
});
