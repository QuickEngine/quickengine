import { testDbClient } from "@quickengine/db/testing";
import { supplierHandoffHandler } from "@quickengine/event-dispatch";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A sandbox order reaches a supplier only if that supplier agreed to it.
 *
 * ── Why the guard exists ─────────────────────────────────────────────────────
 *
 * 🔴 Supplier connections carry no mode — one Shopify store, one token, one
 * Collective link — so nothing downstream can tell a rehearsal from a real
 * order. Without the guard a test checkout placed a genuine order and a
 * supplier shipped actual goods for a sale that never happened.
 *
 * ── Why it has an exception ──────────────────────────────────────────────────
 *
 * 🔑 The danger is a supplier who does not KNOW a rehearsal is coming. Once one
 * has agreed, that danger is gone for them and nobody else — which is why the
 * opt-in is per supplier. A workspace switch would also un-guard every other
 * supplier, including ones added later by somebody who never agreed to anything.
 */

const owner = "sbx-owner";
const workspaceId = "00000000-0000-4000-8000-000000180001";
const clientId = "00000000-0000-4000-8000-000000180002";
const orderId = "00000000-0000-4000-8000-000000180003";
const itemA = "00000000-0000-4000-8000-000000180004";
const itemB = "00000000-0000-4000-8000-000000180005";
const agreed = "00000000-0000-4000-8000-000000180006";
const notAsked = "00000000-0000-4000-8000-000000180007";

async function seed(environment: "test" | "live") {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Asher', 'sbx@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type, environment)
		values (${workspaceId}, ${owner}, 'Caffeinate', 'ecommerce', ${environment})
	`;
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values (${workspaceId}, 'inventory', true), (${workspaceId}, 'orders', true)
	`;
	// A sending address, or the handler fails closed before it ever gets here.
	await sql`
		insert into workspace_branding (workspace_id, portal_slug, display_name, sender_email, support_email)
		values (${workspaceId}, 'caffeinate-sbx', 'Caffeinate', 'hello@caffeinate.shop', 'hello@caffeinate.shop')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientId}, ${workspaceId}, 'Ada', 'ada@example.com')
	`;
	for (const [id, name] of [
		[itemA, "Dark Mode"],
		[itemB, "Light Mode"],
	] as const) {
		await sql`
			insert into catalog_items (id, workspace_id, name, type, status, pricing_model, currency)
			values (${id}, ${workspaceId}, ${name}, 'physical', 'active', 'fixed', 'CAD')
		`;
	}
	await sql`
		insert into suppliers (id, workspace_id, name, handoff_method, handoff_target, contact_email, sandbox_handoff_enabled)
		values (${agreed}, ${workspaceId}, 'EZPZ Coffee', 'email', 'liam@example.com', 'liam@example.com', true)
	`;
	await sql`
		insert into suppliers (id, workspace_id, name, handoff_method, handoff_target, contact_email, sandbox_handoff_enabled)
		values (${notAsked}, ${workspaceId}, 'Someone Else', 'email', 'nope@example.com', 'nope@example.com', false)
	`;
	await sql`
		insert into supplier_skus (workspace_id, supplier_id, catalog_item_id, supplier_sku, unit_cost_cents, currency)
		values
			(${workspaceId}, ${agreed}, ${itemA}, 'EZPZ-DARK-250', 1500, 'CAD'),
			(${workspaceId}, ${notAsked}, ${itemB}, 'OTHER-1', 1200, 'CAD')
	`;
	await sql`
		insert into orders (id, workspace_id, sequence, number, status, client_id, client_name, client_email, currency, subtotal_cents, total_cents, environment,
			ship_to_name, ship_to_line1, ship_to_city, ship_to_region, ship_to_postal_code, ship_to_country_code)
		values (${orderId}, ${workspaceId}, 1, 'ORD-0001', 'placed', ${clientId}, 'Ada', 'ada@example.com', 'CAD', 5800, 5800, ${environment},
			'Ada', '1 Hampton Crescent', 'Sylvan Lake', 'AB', 'T4S 0N2', 'CA')
	`;
	await sql`
		insert into order_line_items (order_id, catalog_item_id, name, type, quantity, unit_price_cents, line_total_cents, position)
		values
			(${orderId}, ${itemA}, 'Dark Mode', 'physical', 1, 2900, 2900, 0),
			(${orderId}, ${itemB}, 'Light Mode', 'physical', 1, 2900, 2900, 1)
	`;
}

const paidEvent = () =>
	({
		id: "evt_sbx_paid",
		workspaceId,
		aggregateType: "order",
		aggregateId: orderId,
		eventName: "order.paid",
		payload: { orderId },
	}) as never;

async function statuses() {
	const sql = testDbClient();
	return await sql`
		select s.name, p.status, p.failure_reason
		from purchase_orders p join suppliers s on s.id = p.supplier_id
		where p.workspace_id = ${workspaceId} order by s.name
	`;
}

describe("a sandbox order and its suppliers", () => {
	it("reaches only the supplier who agreed to rehearsals", async () => {
		await seed("test");
		await supplierHandoffHandler(() => {}).handle(paidEvent());

		const rows = await statuses();
		const ezpz = rows.find((r) => r.name === "EZPZ Coffee");
		const other = rows.find((r) => r.name === "Someone Else");

		// The one who agreed was attempted; the one who did not was withheld.
		expect(ezpz?.status).not.toBe("skipped_sandbox");
		expect(other?.status).toBe("skipped_sandbox");
		expect(other?.failure_reason).toContain("sandbox");
	});

	/**
	 * 🔴 The whole point of the guard. A supplier nobody asked must never receive
	 * a rehearsal, however the workspace is configured.
	 */
	it("still raises the purchase order for the supplier it withholds", async () => {
		await seed("test");
		await supplierHandoffHandler(() => {}).handle(paidEvent());
		const rows = await statuses();
		// Both exist: an operator can see what a real order would have asked for.
		expect(rows).toHaveLength(2);
	});

	it("sends to everyone once the workspace is live", async () => {
		await seed("live");
		await supplierHandoffHandler(() => {}).handle(paidEvent());
		const rows = await statuses();
		for (const row of rows) {
			expect(row.status).not.toBe("skipped_sandbox");
		}
	});

	/** ⚠️ At-least-once delivery: a redelivery must not withhold twice or send twice. */
	it("is safe to redeliver", async () => {
		await seed("test");
		const handler = supplierHandoffHandler(() => {});
		await handler.handle(paidEvent());
		await handler.handle(paidEvent());
		await handler.handle(paidEvent());
		const rows = await statuses();
		expect(rows).toHaveLength(2);
	});
});
