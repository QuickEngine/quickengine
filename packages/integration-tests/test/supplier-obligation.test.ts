import { testDbClient } from "@quickengine/db/testing";
import { checkoutSupplierObligation } from "@quickengine/mod-inventory";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * What a basket owes its suppliers, decided at checkout.
 *
 * 🔴 This number becomes the charge's `application_fee_amount`, which Stripe
 * fixes at creation and never lets anyone change. Getting it wrong does not
 * throw — it silently holds back the wrong amount, and the discrepancy only
 * appears later as a supplier who cannot be paid from the platform balance.
 */

const ownerId = "obligation-owner";
const workspaceId = "00000000-0000-4000-8000-0000000f0001";
const supplierA = "00000000-0000-4000-8000-0000000f0002";
const supplierB = "00000000-0000-4000-8000-0000000f0003";
const beans = "00000000-0000-4000-8000-0000000f0004";
const mug = "00000000-0000-4000-8000-0000000f0005";
const ownStock = "00000000-0000-4000-8000-0000000f0006";
const foreign = "00000000-0000-4000-8000-0000000f0007";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Obligation Owner', 'obligation@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Obligation Workspace', 'ecommerce')
	`;
	for (const [id, name] of [
		[supplierA, "Roaster A"],
		[supplierB, "Roaster B"],
	] as const) {
		await sql`
			insert into suppliers (id, workspace_id, name, handoff_method)
			values (${id}, ${workspaceId}, ${name}, 'manual')
		`;
	}
	for (const [id, name] of [
		[beans, "Ethiopia Guji 250g"],
		[mug, "Stoneware Mug"],
		[ownStock, "House Blend"],
		[foreign, "Imported Grinder"],
	] as const) {
		await sql`
			insert into catalog_items (id, workspace_id, name, type, status, pricing_model, currency)
			values (${id}, ${workspaceId}, ${name}, 'physical', 'active', 'fixed', 'CAD')
		`;
	}
	// Two suppliers, and one item this shop stocks itself (no supplier row).
	await sql`
		insert into supplier_skus (workspace_id, supplier_id, catalog_item_id, supplier_sku, unit_cost_cents, currency)
		values
			(${workspaceId}, ${supplierA}, ${beans}, 'GUJI-250', 1500, 'CAD'),
			(${workspaceId}, ${supplierB}, ${mug}, 'MUG-01', 800, 'CAD'),
			(${workspaceId}, ${supplierA}, ${foreign}, 'GRIND-9', 4000, 'USD')
	`;
});

describe("what a basket owes its suppliers", () => {
	it("adds up unit cost times quantity, per supplier", async () => {
		const result = await checkoutSupplierObligation({
			workspaceId,
			currency: "CAD",
			lines: [
				{ catalogItemId: beans, quantity: 2 },
				{ catalogItemId: mug, quantity: 3 },
			],
		});
		// 2 x 1500 + 3 x 800
		expect(result.totalCents).toBe(5400);
		expect(result.bySupplier.get(supplierA)).toBe(3000);
		expect(result.bySupplier.get(supplierB)).toBe(2400);
	});

	it("owes nothing for stock the shop holds itself", async () => {
		const result = await checkoutSupplierObligation({
			workspaceId,
			currency: "CAD",
			lines: [{ catalogItemId: ownStock, quantity: 5 }],
		});
		expect(result.totalCents).toBe(0);
		expect(result.bySupplier.size).toBe(0);
	});

	/**
	 * 🔴 A supplier priced in another currency is SKIPPED, never converted.
	 *
	 * Holding back CAD against a USD obligation would produce a transfer Stripe
	 * cannot make. It becomes a manual settlement instead, which is honest.
	 */
	it("skips a supplier priced in a different currency", async () => {
		const result = await checkoutSupplierObligation({
			workspaceId,
			currency: "CAD",
			lines: [
				{ catalogItemId: beans, quantity: 1 },
				{ catalogItemId: foreign, quantity: 1 },
			],
		});
		expect(result.totalCents).toBe(1500);
		expect(result.bySupplier.get(supplierA)).toBe(1500);
	});

	it("cannot be reached across workspaces", async () => {
		const result = await checkoutSupplierObligation({
			workspaceId: "00000000-0000-4000-8000-0000000f00ff",
			currency: "CAD",
			lines: [{ catalogItemId: beans, quantity: 2 }],
		});
		expect(result.totalCents).toBe(0);
	});

	it("owes nothing for an empty basket", async () => {
		const result = await checkoutSupplierObligation({
			workspaceId,
			currency: "CAD",
			lines: [],
		});
		expect(result.totalCents).toBe(0);
	});
});
