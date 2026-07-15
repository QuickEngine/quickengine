import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	applyInventoryAdjustment,
	createInventoryItem,
	deleteInventoryItem,
	getInventoryItem,
	listInventoryAdjustments,
	listInventoryItems,
	setInventoryItemStatus,
} from "../src";

const ownerId = "inventory-owner";
const workspaceId = "00000000-0000-4000-8000-000000000601";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000602";
const itemId = "00000000-0000-4000-8000-000000000603";
const variantId = "00000000-0000-4000-8000-000000000604";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'Inventory Owner', 'inventory@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Inventory', 'retail'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'retail')`;
	await sql`insert into catalog_items (id, workspace_id, name, type, status, sku, pricing_model, price_cents, currency) values (${itemId}, ${workspaceId}, 'Shirt', 'physical', 'active', 'SHIRT', 'fixed', 3000, 'USD')`;
	await sql`insert into catalog_item_variants (id, workspace_id, catalog_item_id, combination_key, options, status, sku) values (${variantId}, ${workspaceId}, ${itemId}, 'size=large', '[{"name":"Size","value":"Large"}]', 'active', 'SHIRT-L')`;
});

describe("Inventory persistence", () => {
	it("tracks a concrete variant and isolates tenant reads", async () => {
		const item = await createInventoryItem(workspaceId, {
			catalogItemId: itemId,
			catalogItemVariantId: variantId,
			lowStockThreshold: 5,
		});
		expect(item).toMatchObject({ onHand: 0, reserved: 0 });
		expect(await getInventoryItem(otherWorkspaceId, item.id)).toBeUndefined();
		expect(await listInventoryItems(otherWorkspaceId)).toEqual([]);
	});

	it("records append-only movements and idempotent balances", async () => {
		const item = await createInventoryItem(workspaceId, {
			catalogItemId: itemId,
		});
		await applyInventoryAdjustment(workspaceId, item.id, {
			kind: "receive",
			quantity: 10,
			idempotencyKey: "delivery-1",
		});
		await applyInventoryAdjustment(workspaceId, item.id, {
			kind: "receive",
			quantity: 10,
			idempotencyKey: "delivery-1",
		});
		await applyInventoryAdjustment(workspaceId, item.id, {
			kind: "reserve",
			quantity: 3,
		});
		expect(await getInventoryItem(workspaceId, item.id)).toMatchObject({
			onHand: 10,
			reserved: 3,
		});
		expect(await listInventoryAdjustments(workspaceId, item.id)).toHaveLength(
			2,
		);
	});

	it("blocks unsafe archival and retains movement history", async () => {
		const item = await createInventoryItem(workspaceId, {
			catalogItemId: itemId,
		});
		await applyInventoryAdjustment(workspaceId, item.id, {
			kind: "receive",
			quantity: 5,
		});
		await applyInventoryAdjustment(workspaceId, item.id, {
			kind: "reserve",
			quantity: 1,
		});
		await expect(
			setInventoryItemStatus(workspaceId, item.id, "archived"),
		).rejects.toThrow("INVENTORY_HAS_RESERVATIONS");
		await applyInventoryAdjustment(workspaceId, item.id, {
			kind: "release",
			quantity: 1,
		});
		await setInventoryItemStatus(workspaceId, item.id, "archived");
		await expect(deleteInventoryItem(workspaceId, item.id)).rejects.toThrow(
			"INVENTORY_BALANCE_NOT_ZERO",
		);
	});

	it("prevents catalog deletion from erasing inventory history", async () => {
		await createInventoryItem(workspaceId, { catalogItemId: itemId });
		const sql = testDbClient();
		await expect(
			sql`delete from catalog_items where id = ${itemId}`,
		).rejects.toThrow();
	});
});
