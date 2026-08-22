import { db } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { setFulfillmentStatus } from "@quickengine/mod-fulfillment";
import {
	createOrder,
	ensureOrderFulfillment,
	releaseOrderStockInTx,
	restockOrderStockInTx,
	setOrderStatus,
} from "@quickengine/mod-orders";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "restock-owner";
const workspaceId = "00000000-0000-4000-8000-0000000e0001";
const clientId = "00000000-0000-4000-8000-0000000e0002";
const catalogItemId = "00000000-0000-4000-8000-0000000e0003";
const inventoryItemId = "00000000-0000-4000-8000-0000000e0004";

/** What the shelf says right now. */
async function balance() {
	const sql = testDbClient();
	const [row] = await sql`
		select on_hand, reserved from inventory_items where id = ${inventoryItemId}
	`;
	return { onHand: Number(row.on_hand), reserved: Number(row.reserved) };
}

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Restock Owner', 'restock@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Restock Workspace', 'ecommerce')
	`;
	// Stock only moves for a workspace that tracks it. See `inventory-bridge.ts`.
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values (${workspaceId}, 'inventory', true), (${workspaceId}, 'orders', true)
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com')
	`;
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status, pricing_model, currency)
		values (${catalogItemId}, ${workspaceId}, 'Ethiopia Guji 250g', 'physical', 'active', 'fixed', 'CAD')
	`;
	await sql`
		insert into inventory_items (id, workspace_id, catalog_item_id, status, on_hand, reserved, low_stock_threshold)
		values (${inventoryItemId}, ${workspaceId}, ${catalogItemId}, 'active', 10, 0, 2)
	`;
});

async function twoBagOrder() {
	return createOrder(workspaceId, {
		clientId,
		currency: "CAD",
		lines: [
			{
				name: "Ethiopia Guji 250g",
				type: "physical",
				quantity: 2,
				unitPriceCents: 2_200,
				catalogItemId,
			},
		],
	});
}

/**
 * 🔴 Refunding used to reverse the money and leave the count alone, so a
 * refunded bag stayed sold for ever and the business slowly undercounted what
 * it could sell. Nothing looked broken while it happened.
 */
describe("a refund puts stock back", () => {
	it("returns goods that already shipped to the shelf", async () => {
		const order = await twoBagOrder();
		await setOrderStatus(workspaceId, order.id, "placed");
		expect(await balance()).toEqual({ onHand: 10, reserved: 2 });

		// The bags physically leave.
		await setOrderStatus(workspaceId, order.id, "confirmed");
		await setOrderStatus(workspaceId, order.id, "processing");
		// The real delivery, not a hand-written row: an order cannot reach
		// `fulfilled` until its delivery has, and that gate is the thing that makes
		// stock leave the shelf at all.
		const fulfillmentId = await ensureOrderFulfillment(workspaceId, order.id);
		await setFulfillmentStatus(workspaceId, fulfillmentId, "fulfilled");
		await setOrderStatus(workspaceId, order.id, "fulfilled");
		expect(await balance()).toEqual({ onHand: 8, reserved: 0 });

		// The customer sends them back and is refunded.
		await db.transaction((tx) =>
			restockOrderStockInTx(tx, workspaceId, order.id),
		);
		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});

	it("gives back a hold on goods that never shipped", async () => {
		const order = await twoBagOrder();
		await setOrderStatus(workspaceId, order.id, "placed");
		expect(await balance()).toEqual({ onHand: 10, reserved: 2 });

		// 🔴 A release, NOT a return: nothing left the shelf, so adding to
		// `onHand` here would invent two bags that were never gone.
		await db.transaction((tx) =>
			restockOrderStockInTx(tx, workspaceId, order.id),
		);
		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});

	/**
	 * ⚠️ The outbox delivers at least once, so this WILL happen. Restocking twice
	 * would hand a business free stock it does not have and oversell the next
	 * customer.
	 */
	it("is a no-op the second time, however many times it runs", async () => {
		const order = await twoBagOrder();
		await setOrderStatus(workspaceId, order.id, "placed");
		await setOrderStatus(workspaceId, order.id, "confirmed");
		await setOrderStatus(workspaceId, order.id, "processing");
		// The real delivery, not a hand-written row: an order cannot reach
		// `fulfilled` until its delivery has, and that gate is the thing that makes
		// stock leave the shelf at all.
		const fulfillmentId = await ensureOrderFulfillment(workspaceId, order.id);
		await setFulfillmentStatus(workspaceId, fulfillmentId, "fulfilled");
		await setOrderStatus(workspaceId, order.id, "fulfilled");

		for (let attempt = 0; attempt < 3; attempt++) {
			await db.transaction((tx) =>
				restockOrderStockInTx(tx, workspaceId, order.id),
			);
		}
		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});

	/**
	 * A cancelled order already released its hold. A refund arriving afterwards
	 * must not release it a second time and drive `reserved` negative.
	 */
	it("does not double-release stock a cancellation already gave back", async () => {
		const order = await twoBagOrder();
		await setOrderStatus(workspaceId, order.id, "placed");
		await db.transaction((tx) =>
			releaseOrderStockInTx(tx, workspaceId, order.id),
		);
		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });

		await db.transaction((tx) =>
			restockOrderStockInTx(tx, workspaceId, order.id),
		);
		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});

	/** A workspace that does not track stock has nothing to put back. */
	it("does nothing when the workspace does not track inventory", async () => {
		const sql = testDbClient();
		await sql`
			update workspace_modules set enabled = false
			where workspace_id = ${workspaceId} and module_id = 'inventory'
		`;
		const order = await twoBagOrder();
		await setOrderStatus(workspaceId, order.id, "placed");
		await db.transaction((tx) =>
			restockOrderStockInTx(tx, workspaceId, order.id),
		);
		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});
});
