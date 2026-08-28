import { testDbClient } from "@quickengine/db/testing";
import {
	supplierRefundHandler,
	supplierSettlementHandler,
} from "@quickengine/event-dispatch";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The whole supplier settlement rail, against the REAL payment provider.
 *
 * ── Why this exists alongside the seam tests ─────────────────────────────────
 *
 * 🔴 `supplier-settlement-flow.test.ts` injects the transfer function, which is
 * what makes duplicate delivery and refusal reproducible. It proves the LOGIC.
 * It cannot prove that the provider accepts what we send it — wrong currency
 * casing, an amount the account cannot receive, a destination that has not
 * finished onboarding, a metadata key too long. Those only fail against Stripe.
 *
 * ⚠️ OPT-IN. Skipped unless `STRIPE_CONNECT_TEST_SECRET_KEY` and
 * `LIVE_SUPPLIER_ACCOUNT` are set, so CI and an ordinary `pnpm test` never
 * depend on a network call to a payment provider.
 *
 *   STRIPE_CONNECT_TEST_SECRET_KEY=sk_test_… \
 *   LIVE_SUPPLIER_ACCOUNT=acct_… \
 *   pnpm --filter @quickengine/integration-tests test -- live-supplier
 *
 * 🔑 Test mode only. It moves real Stripe balance, but never real money, and it
 * reverses everything it sends.
 */

const STRIPE = process.env.STRIPE_CONNECT_TEST_SECRET_KEY;
// Defaulted to "" rather than left undefined: postgres.js refuses an undefined
// parameter, and `live` below is what actually gates the suite.
const SUPPLIER_ACCOUNT = process.env.LIVE_SUPPLIER_ACCOUNT ?? "";
const live = Boolean(STRIPE && SUPPLIER_ACCOUNT);

const owner = "live-owner";
const workspaceId = "00000000-0000-4000-8000-0000000e2e01";
const clientId = "00000000-0000-4000-8000-0000000e2e02";
const orderId = "00000000-0000-4000-8000-0000000e2e03";
const catalogItemId = "00000000-0000-4000-8000-0000000e2e04";
const supplierId = "00000000-0000-4000-8000-0000000e2e05";
const paymentId = "00000000-0000-4000-8000-0000000e2e06";

const RETAIL = 2646;
const COST = 1500;

async function stripe(path: string, on?: string) {
	const headers: Record<string, string> = { Authorization: `Bearer ${STRIPE}` };
	if (on) headers["Stripe-Account"] = on;
	const response = await fetch(`https://api.stripe.com/v1/${path}`, {
		headers,
	});
	return (await response.json()) as Record<string, never>;
}

beforeEach(async () => {
	if (!live) return;
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Asher', 'live@example.com', true)
	`;
	// Sandbox: the money is Stripe test balance, and the workspace says so.
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type, environment)
		values (${workspaceId}, ${owner}, 'Caffeinate', 'ecommerce', 'test')
	`;
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values (${workspaceId}, 'inventory', true), (${workspaceId}, 'orders', true)
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientId}, ${workspaceId}, 'Ada', 'ada@example.com')
	`;
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status, pricing_model, currency)
		values (${catalogItemId}, ${workspaceId}, 'Ethiopia Guji 250g', 'physical', 'active', 'fixed', 'CAD')
	`;
	await sql`
		insert into suppliers (id, workspace_id, name, handoff_method)
		values (${supplierId}, ${workspaceId}, 'EZPZ Coffee', 'manual')
	`;
	await sql`
		insert into supplier_skus (workspace_id, supplier_id, catalog_item_id, supplier_sku, unit_cost_cents, currency)
		values (${workspaceId}, ${supplierId}, ${catalogItemId}, 'EZPZ-GUJI-250', ${COST}, 'CAD')
	`;
	await sql`
		insert into supplier_payment_accounts (workspace_id, supplier_id, provider, external_account_id, environment, transfers_enabled, status)
		values (${workspaceId}, ${supplierId}, 'stripe', ${SUPPLIER_ACCOUNT}, 'test', 'yes', 'active')
	`;
	await sql`
		insert into orders (id, workspace_id, sequence, number, status, client_id, client_name, client_email, currency, subtotal_cents, total_cents, environment)
		values (${orderId}, ${workspaceId}, 1, 'ORD-0001', 'placed', ${clientId}, 'Ada', 'ada@example.com', 'CAD', ${RETAIL}, ${RETAIL}, 'test')
	`;
	await sql`
		insert into order_line_items (order_id, catalog_item_id, name, type, quantity, unit_price_cents, line_total_cents, position)
		values (${orderId}, ${catalogItemId}, 'Ethiopia Guji 250g', 'physical', 1, ${RETAIL}, ${RETAIL}, 0)
	`;
	await sql`
		insert into payments (id, workspace_id, order_id, client_id, client_email, provider, environment, status, amount_cents, currency, supplier_fee_cents)
		values (${paymentId}, ${workspaceId}, ${orderId}, ${clientId}, 'ada@example.com', 'stripe', 'test', 'succeeded', ${RETAIL}, 'CAD', ${COST})
	`;
});

const paidEvent = () =>
	({
		id: "evt_live_paid",
		workspaceId,
		aggregateType: "order",
		aggregateId: orderId,
		eventName: "order.paid",
		payload: { orderId },
	}) as never;

describe.skipIf(!live)("supplier settlement against real Stripe", () => {
	it("pays the supplier, once, and the supplier can see who paid them", async () => {
		const sql = testDbClient();

		// The real handler, with the real transfer function — nothing injected.
		await supplierSettlementHandler(() => {}).handle(paidEvent());

		const [po] = await sql`
			select id, number, status from purchase_orders where workspace_id = ${workspaceId}
		`;
		expect(po, "a purchase order should have been raised").toBeTruthy();

		const [payment] = await sql`
			select * from supplier_payments where workspace_id = ${workspaceId}
		`;
		expect(payment.status).toBe("succeeded");
		// 🔴 The agreed COST, never what the customer paid.
		expect(Number(payment.amount_cents)).toBe(COST);
		expect(payment.idempotency_key).toBe(`supplier-payment:${po.id}`);

		// The transfer exists at the provider, not just in our table.
		const transfer = await stripe(`transfers/${payment.external_transfer_id}`);
		expect(transfer.id).toBe(payment.external_transfer_id);
		expect(Number(transfer.amount)).toBe(COST);
		expect(transfer.destination).toBe(SUPPLIER_ACCOUNT);

		/**
		 * 🔴 What the supplier actually reads.
		 *
		 * The transfer's own description never reaches them; their copy is a
		 * separate object that has to be labelled. Verified here against the
		 * recipient's own balance line, which is the row they see.
		 */
		const balance = await stripe(
			"balance_transactions?limit=1",
			SUPPLIER_ACCOUNT,
		);
		const line = (balance.data as unknown as { description: string }[])[0];
		expect(line.description).toBe(
			"Caffeinate — Order ORD-0001 supplier settlement",
		);

		// ── Redelivery must not pay twice ──
		await supplierSettlementHandler(() => {}).handle(paidEvent());
		await supplierSettlementHandler(() => {}).handle(paidEvent());
		const rows = await sql`
			select count(*)::int as n from supplier_payments where workspace_id = ${workspaceId}
		`;
		expect(rows[0].n).toBe(1);

		// ── A full refund pulls the supplier's share back ──
		const [refund] = await sql`
			insert into payment_refunds (workspace_id, payment_id, amount_cents, provider, environment)
			values (${workspaceId}, ${paymentId}, ${RETAIL}, 'stripe', 'test')
			returning id
		`;
		await supplierRefundHandler(() => {}).handle({
			id: "evt_live_refund",
			workspaceId,
			aggregateType: "payment",
			aggregateId: paymentId,
			eventName: "payment.refunded",
			payload: { paymentId, refundId: refund.id, restock: true },
		} as never);

		const [unwound] = await sql`
			select status, reversed_cents from supplier_payments where workspace_id = ${workspaceId}
		`;
		expect(Number(unwound.reversed_cents)).toBe(COST);
		expect(unwound.status).toBe("reversed");

		// And the provider agrees, so the money is genuinely back.
		const reversed = await stripe(`transfers/${payment.external_transfer_id}`);
		expect(reversed.reversed).toBe(true);
	});
});
