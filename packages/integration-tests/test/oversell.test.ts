import { testDbClient } from "@quickengine/db/testing";
import { createOrder, setOrderStatus } from "@quickengine/mod-orders";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "oversell-owner";
const workspaceId = "00000000-0000-4000-8000-00000012a001";
const clientId = "00000000-0000-4000-8000-00000012a002";
const catalogItemId = "00000000-0000-4000-8000-00000012a003";
const inventoryItemId = "00000000-0000-4000-8000-00000012a004";

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
		values (${ownerId}, 'Oversell Owner', 'oversell@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Oversell Workspace', 'ecommerce')
	`;
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
		values (${catalogItemId}, ${workspaceId}, 'Last Bag', 'physical', 'active', 'fixed', 'CAD')
	`;
	// 🔴 ONE unit. Everything below is about who gets it.
	await sql`
		insert into inventory_items (id, workspace_id, catalog_item_id, status, on_hand, reserved, low_stock_threshold)
		values (${inventoryItemId}, ${workspaceId}, ${catalogItemId}, 'active', 1, 0, 0)
	`;
});

async function oneBagOrder() {
	return createOrder(workspaceId, {
		clientId,
		currency: "CAD",
		lines: [
			{
				name: "Last Bag",
				type: "physical",
				quantity: 1,
				unitPriceCents: 2_200,
				catalogItemId,
			},
		],
	});
}

/**
 * 🔴 The classic ecommerce killer, and the one an external audit flagged as a
 * P0 it could not verify from outside the repository.
 *
 * Two customers buy the last unit at the same instant. JavaScript being
 * single-threaded protects nothing — the two requests are two database
 * transactions, and without a row lock both read `on_hand = 1`, both decide
 * they may proceed, and both succeed. The shop then owes a bag it does not
 * have, and finds out when a customer emails.
 *
 * `reserveOrderStockInTx` runs inside the order transition's `FOR UPDATE`, so
 * the second transaction blocks until the first commits and then sees the
 * truth. This test exists to prove that, and to keep proving it.
 */
describe("two customers race for the last unit", () => {
	it("lets exactly one of them have it", async () => {
		const [first, second] = await Promise.all([oneBagOrder(), oneBagOrder()]);

		// Both orders exist as drafts. Reserving happens on `placed`, which is
		// where the race actually is.
		const results = await Promise.allSettled([
			setOrderStatus(workspaceId, first.id, "placed"),
			setOrderStatus(workspaceId, second.id, "placed"),
		]);

		const placed = results.filter((r) => r.status === "fulfilled");
		const refused = results.filter((r) => r.status === "rejected");

		expect(placed).toHaveLength(1);
		expect(refused).toHaveLength(1);

		// 🔴 The number that matters. One unit held, none invented.
		expect(await balance()).toEqual({ onHand: 1, reserved: 1 });
	});

	/**
	 * ⚠️ Ten at once, not two. A lock that merely narrows the window passes a
	 * two-way race often enough to look correct.
	 */
	it("survives ten simultaneous buyers of one unit", async () => {
		const orders = await Promise.all(
			Array.from({ length: 10 }, () => oneBagOrder()),
		);
		const results = await Promise.allSettled(
			orders.map((order) => setOrderStatus(workspaceId, order.id, "placed")),
		);

		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(await balance()).toEqual({ onHand: 1, reserved: 1 });
	});

	/**
	 * The negative control. If stock is plentiful the same concurrency must NOT
	 * refuse anybody — a lock that simply rejects everything would pass the
	 * tests above and destroy the business.
	 */
	it("does not refuse concurrent buyers when there is enough stock", async () => {
		const sql = testDbClient();
		await sql`update inventory_items set on_hand = 10 where id = ${inventoryItemId}`;

		const orders = await Promise.all(
			Array.from({ length: 5 }, () => oneBagOrder()),
		);
		const results = await Promise.allSettled(
			orders.map((order) => setOrderStatus(workspaceId, order.id, "placed")),
		);

		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
		expect(await balance()).toEqual({ onHand: 10, reserved: 5 });
	});
});

/**
 * 🔴 Raised by an external reviewer, 2026-08-22:
 *
 * > "Residual risk is limited to any inventory adjustment path that does NOT go
 * > through the same locked transition — manual adjustments, refunds that
 * > restock, supplier-driven changes."
 *
 * A fair challenge, and the answer is better than the one first given them. The
 * lock is not taken by the order transition at all: `applyInventoryAdjustmentInTx`
 * takes `FOR UPDATE` on the inventory row itself, and EVERY movement in the
 * system goes through that one function — reserve, release, consume, restock,
 * receive, damage, correction. There is no second path to forget.
 *
 * These tests exist so that remains true.
 */
describe("every stock path serialises, not just the order one", () => {
	it("does not lose a count when hand adjustments race each other", async () => {
		const { applyInventoryAdjustment } = await import(
			"@quickengine/mod-inventory"
		);
		const sql = testDbClient();
		await sql`update inventory_items set on_hand = 0 where id = ${inventoryItemId}`;

		// Twenty simultaneous +1s. A read-modify-write without a lock loses some
		// of them silently, and the count is simply wrong for ever after.
		await Promise.all(
			Array.from({ length: 20 }, (_unused, index) =>
				applyInventoryAdjustment(workspaceId, inventoryItemId, {
					kind: "receive",
					quantity: 1,
					idempotencyKey: `race-receive-${index}`,
					note: "Concurrent hand count",
				}),
			),
		);

		expect((await balance()).onHand).toBe(20);
	});

	it("cannot be driven negative by simultaneous removals", async () => {
		const { applyInventoryAdjustment } = await import(
			"@quickengine/mod-inventory"
		);
		const sql = testDbClient();
		await sql`update inventory_items set on_hand = 5, reserved = 0 where id = ${inventoryItemId}`;

		// Ten people each try to take one from a shelf of five.
		const results = await Promise.allSettled(
			Array.from({ length: 10 }, (_unused, index) =>
				applyInventoryAdjustment(workspaceId, inventoryItemId, {
					kind: "damage",
					quantity: 1,
					idempotencyKey: `race-damage-${index}`,
					note: "Concurrent write-off",
				}),
			),
		);

		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
		// 🔴 The number that matters: never below zero, whatever the ordering.
		expect((await balance()).onHand).toBe(0);
	});
});
