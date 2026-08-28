import { workspaceCurrency } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { createSupplierSku } from "@quickengine/mod-inventory";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The currency a workspace is set to is the currency it uses.
 *
 * 🔴 It was not. Six modules each carried their own `defaultCurrency`
 * defaulting to `USD`, the settings screen wrote to one of them, and
 * `supplierSkuInputSchema` defaulted to `USD` on top. A Canadian business could
 * set CAD, see it saved, and still have its supplier SKUs stored in USD.
 *
 * ⚠️ That is a money bug, not a display bug. `checkoutSupplierObligation` SKIPS
 * a supplier SKU whose currency differs from its product rather than converting
 * it, so the supplier is never paid and nothing anywhere reports it. Confirmed
 * live on 2026-08-28: three SKUs entered as "$15.00" all stored USD against CAD
 * products, and were only caught by reading the rows.
 */

const owner = "ccy-owner";
const workspaceId = "00000000-0000-4000-8000-000000170001";
const catalogItemId = "00000000-0000-4000-8000-000000170002";
const supplierId = "00000000-0000-4000-8000-000000170003";

async function seed(settings: Record<string, unknown>[]) {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Asher', 'ccy@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${owner}, 'Caffeinate', 'ecommerce')
	`;
	for (const row of settings) {
		await sql`
			insert into workspace_modules (workspace_id, module_id, enabled, settings)
			values (${workspaceId}, ${row.moduleId as string}, true, ${sql.json(row.settings as never)})
		`;
	}
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status, pricing_model, currency)
		values (${catalogItemId}, ${workspaceId}, 'Dark Mode', 'physical', 'active', 'fixed', 'CAD')
	`;
	await sql`
		insert into suppliers (id, workspace_id, name, handoff_method)
		values (${supplierId}, ${workspaceId}, 'EZPZ Coffee', 'email')
	`;
}

beforeEach(async () => {
	// Each test seeds its own module settings; nothing is shared.
});

describe("the workspace's currency", () => {
	it("comes from what the settings screen writes", async () => {
		await seed([
			{ moduleId: "orders", settings: { defaultCurrency: "CAD" } },
			// Deliberately left at the old default, to prove `orders` wins.
			{ moduleId: "payments", settings: { defaultCurrency: "USD" } },
		]);
		expect(await workspaceCurrency(workspaceId)).toBe("CAD");
	});

	/** ⚠️ For a workspace configured before the settings screen existed. */
	it("falls back through the other money modules", async () => {
		await seed([
			{ moduleId: "orders", settings: {} },
			{ moduleId: "products-services", settings: { defaultCurrency: "GBP" } },
		]);
		expect(await workspaceCurrency(workspaceId)).toBe("GBP");
	});

	it("normalises case", async () => {
		await seed([{ moduleId: "orders", settings: { defaultCurrency: "cad" } }]);
		expect(await workspaceCurrency(workspaceId)).toBe("CAD");
	});

	/** A settings blob is plain JSON and can hold anything at all. */
	it("ignores a value that is not a currency code", async () => {
		await seed([
			{ moduleId: "orders", settings: { defaultCurrency: "Canadian" } },
			{ moduleId: "payments", settings: { defaultCurrency: "CAD" } },
		]);
		expect(await workspaceCurrency(workspaceId)).toBe("CAD");
	});

	it("falls back to USD when nothing is configured", async () => {
		await seed([]);
		expect(await workspaceCurrency(workspaceId)).toBe("USD");
	});
});

describe("a supplier SKU created without a currency", () => {
	/**
	 * 🔴 The exact failure that hit Caffeinate: the form sends no currency, and
	 * the SKU must not therefore be priced in a currency nobody chose.
	 */
	it("inherits the workspace currency instead of defaulting to USD", async () => {
		await seed([{ moduleId: "orders", settings: { defaultCurrency: "CAD" } }]);
		const row = await createSupplierSku(workspaceId, {
			supplierId,
			catalogItemId,
			supplierSku: "EZPZ-DARK-250",
			unitCostCents: 1500,
		});
		expect(row.currency).toBe("CAD");

		const sql = testDbClient();
		const [stored] = await sql`
			select currency from supplier_skus where workspace_id = ${workspaceId}
		`;
		// Read back from the row, not the return value: the driver is what bit.
		expect(stored.currency).toBe("CAD");
	});

	/** ⚠️ A supplier who genuinely invoices in another currency is believed. */
	it("still honours a currency the caller names", async () => {
		await seed([{ moduleId: "orders", settings: { defaultCurrency: "CAD" } }]);
		const row = await createSupplierSku(workspaceId, {
			supplierId,
			catalogItemId,
			supplierSku: "EZPZ-DARK-250",
			unitCostCents: 1500,
			currency: "USD",
		});
		expect(row.currency).toBe("USD");
	});
});
