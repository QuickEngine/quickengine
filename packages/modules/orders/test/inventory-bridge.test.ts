import { testDbClient } from "@quickengine/db/testing";
import { setFulfillmentStatus } from "@quickengine/mod-fulfillment";
import { getInventoryItem } from "@quickengine/mod-inventory";
import { beforeEach, describe, expect, it } from "vitest";
import { createOrder, ensureOrderFulfillment, setOrderStatus } from "../src";

const ownerId = "orders-stock-owner";
const workspaceId = "00000000-0000-4000-8000-000000000901";
const clientId = "00000000-0000-4000-8000-000000000903";
const itemId = "00000000-0000-4000-8000-000000000905";
const stockId = "00000000-0000-4000-8000-000000000906";

const order2Physical = {
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

/** Enable inventory for the workspace, optionally allowing negative stock. */
async function enableInventory(allowNegativeStock = false) {
	const sql = testDbClient();
	await sql`insert into workspace_modules (workspace_id, module_id, enabled, settings)
		values (${workspaceId}, 'inventory', true, ${sql.json({ defaultLowStockThreshold: 5, allowNegativeStock })})`;
}

async function stock(onHand: number) {
	const sql = testDbClient();
	await sql`insert into inventory_items (id, workspace_id, catalog_item_id, on_hand, reserved)
		values (${stockId}, ${workspaceId}, ${itemId}, ${onHand}, 0)`;
}

const balance = async () => {
	const item = await getInventoryItem(workspaceId, stockId);
	return { onHand: item?.onHand, reserved: item?.reserved };
};

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'Stock Owner', 'stock@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Stock', 'retail')`;
	await sql`insert into client_records (id, workspace_id, name, email) values (${clientId}, ${workspaceId}, 'Buyer', 'buyer@example.com')`;
	await sql`insert into catalog_items (id, workspace_id, name, type, status, sku, pricing_model, price_cents, currency) values (${itemId}, ${workspaceId}, 'Printed cards', 'physical', 'active', 'CARDS', 'fixed', 1500, 'USD')`;
});

/**
 * Put the workspace in sandbox mode.
 *
 * ⚠️ `environment` belongs to the WORKSPACE and is copied onto each order as it
 * is created — it is not something a caller passes per order. An earlier version
 * of these tests handed `environment: "test"` to `createOrder`, where it was
 * silently dropped and every assertion then described live behaviour.
 */
async function sandboxMode() {
	const sql = testDbClient();
	await sql`update quickengine_workspaces set environment = 'test' where id = ${workspaceId}`;
}

describe("a sandbox order never touches real stock", () => {
	/**
	 * 🔴 Observed on 2026-08-23: a test checkout produced `reserve:1` against the
	 * LIVE inventory record, and only the refund gave it back. A rehearsal that
	 * stopped after the purchase would leave a real unit reserved for an order
	 * that never existed, and the shop would show one fewer to real buyers.
	 */
	it("does not reserve when the order is in test mode", async () => {
		await enableInventory();
		await stock(10);
		await sandboxMode();
		const order = await createOrder(workspaceId, order2Physical);

		await setOrderStatus(workspaceId, order.id, "placed");

		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});

	/**
	 * 🔴 The half that would be worse than the bug. Skipping `reserve` while
	 * honouring `release` would CREATE stock out of a cancelled test order — so
	 * every movement has to be guarded, not just the one that was noticed.
	 */
	it("does not release stock it never reserved", async () => {
		await enableInventory();
		await stock(10);
		await sandboxMode();
		const order = await createOrder(workspaceId, order2Physical);

		await setOrderStatus(workspaceId, order.id, "placed");
		await setOrderStatus(workspaceId, order.id, "cancelled");

		// Not 12. A cancelled test order must not invent two units.
		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});

	it("still reserves for a live order", async () => {
		await enableInventory();
		await stock(10);
		// Left in its default live mode.
		const order = await createOrder(workspaceId, order2Physical);

		await setOrderStatus(workspaceId, order.id, "placed");

		expect(await balance()).toEqual({ onHand: 10, reserved: 2 });
	});

	/**
	 * ⚠️ A test order cannot oversell either, because it never counts against
	 * stock at all — which is the correct behaviour and worth pinning: somebody
	 * rehearsing must not be blocked by their own real stock level.
	 */
	it("cannot be blocked by real stock running out", async () => {
		await enableInventory();
		await stock(1);
		await sandboxMode();
		const first = await createOrder(workspaceId, order2Physical);
		const second = await createOrder(workspaceId, order2Physical);

		await setOrderStatus(workspaceId, first.id, "placed");
		await setOrderStatus(workspaceId, second.id, "placed");

		expect(await balance()).toEqual({ onHand: 1, reserved: 0 });
	});
});

describe("Order stock reservation", () => {
	it("reserves on placed, without changing what is on hand", async () => {
		await enableInventory();
		await stock(10);
		const order = await createOrder(workspaceId, order2Physical);

		await setOrderStatus(workspaceId, order.id, "placed");

		// The goods have not moved yet; they are only spoken for.
		expect(await balance()).toEqual({ onHand: 10, reserved: 2 });
	});

	/**
	 * The behaviour this whole bridge exists for: two buyers cannot both claim the
	 * last unit. Under the default strict policy the second placement is refused.
	 */
	it("refuses to place an order that would oversell", async () => {
		await enableInventory();
		await stock(3);
		const first = await createOrder(workspaceId, order2Physical);
		const second = await createOrder(workspaceId, order2Physical);

		await setOrderStatus(workspaceId, first.id, "placed");
		await expect(
			setOrderStatus(workspaceId, second.id, "placed"),
		).rejects.toThrow("INVENTORY_INSUFFICIENT_AVAILABLE");

		// The refused order must leave the balance exactly as the first order left it.
		expect(await balance()).toEqual({ onHand: 3, reserved: 2 });
	});

	// The policy decides whether an operation is allowed; the engine only computes
	// the balance. A distributor supporting backorders opts into this.
	it("permits overselling when the workspace policy allows negative stock", async () => {
		await enableInventory(true);
		await stock(1);
		const order = await createOrder(workspaceId, order2Physical);

		await setOrderStatus(workspaceId, order.id, "placed");
		expect(await balance()).toEqual({ onHand: 1, reserved: 2 });
	});

	it("releases the hold when the order is cancelled", async () => {
		await enableInventory();
		await stock(10);
		const order = await createOrder(workspaceId, order2Physical);

		await setOrderStatus(workspaceId, order.id, "placed");
		await setOrderStatus(workspaceId, order.id, "cancelled");

		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});

	it("takes the goods off the shelf when the order is fulfilled", async () => {
		await enableInventory();
		await stock(10);
		const order = await createOrder(workspaceId, order2Physical);

		await setOrderStatus(workspaceId, order.id, "placed");
		await setOrderStatus(workspaceId, order.id, "confirmed");
		await setOrderStatus(workspaceId, order.id, "processing");
		// An order cannot be fulfilled until its delivery is, so drive that first.
		const fulfillmentId = await ensureOrderFulfillment(workspaceId, order.id);
		await setFulfillmentStatus(workspaceId, fulfillmentId, "fulfilled");
		await setOrderStatus(workspaceId, order.id, "fulfilled");

		expect(await balance()).toEqual({ onHand: 8, reserved: 0 });
	});

	// A workspace that sells without tracking stock must be entirely unaffected.
	it("is a no-op when the inventory module is not enabled", async () => {
		await stock(10);
		const order = await createOrder(workspaceId, order2Physical);

		await setOrderStatus(workspaceId, order.id, "placed");
		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});

	// Inventory enabled, but this particular product is untracked.
	it("skips a line with no inventory item rather than failing the order", async () => {
		await enableInventory();
		const order = await createOrder(workspaceId, order2Physical);

		await expect(
			setOrderStatus(workspaceId, order.id, "placed"),
		).resolves.toMatchObject({ status: "placed" });
	});

	it("does not reserve for non-physical lines", async () => {
		await enableInventory();
		await stock(10);
		const order = await createOrder(workspaceId, {
			clientId,
			currency: "USD",
			lines: [
				{
					catalogItemId: itemId,
					name: "Consulting",
					type: "service" as const,
					quantity: 3,
					unitPriceCents: 5000,
				},
			],
		});

		await setOrderStatus(workspaceId, order.id, "placed");
		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});

	// Drafts are still being edited and must not hold stock away from real orders.
	it("holds nothing while the order is a draft", async () => {
		await enableInventory();
		await stock(10);
		await createOrder(workspaceId, order2Physical);

		expect(await balance()).toEqual({ onHand: 10, reserved: 0 });
	});
});
