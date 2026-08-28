import { testDbClient } from "@quickengine/db/testing";
import {
	supplierRefundHandler,
	supplierSettlementHandler,
} from "@quickengine/event-dispatch";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Refunding a customer pulls the supplier's share back.
 *
 * 🔴 The loss this prevents is real money out of the business's own pocket. The
 * supplier is paid automatically the moment an order is paid, so a customer
 * refunded in full afterwards left Caffeinate $15.00 down on a $26.46 order,
 * with nothing anywhere explaining where it went.
 *
 * ⚠️ Every test here settles FIRST through the real settlement handler, so the
 * state being unwound is state the system actually produced.
 */

const owner = "refund-owner";
const workspaceId = "00000000-0000-4000-8000-000000160001";
const clientId = "00000000-0000-4000-8000-000000160002";
const orderId = "00000000-0000-4000-8000-000000160003";
const catalogItemId = "00000000-0000-4000-8000-000000160004";
const supplierId = "00000000-0000-4000-8000-000000160005";
const paymentId = "00000000-0000-4000-8000-000000160006";

const RETAIL = 2646;
const COST = 1500;

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Asher', 'refund@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type, environment)
		values (${workspaceId}, ${owner}, 'Caffeinate', 'ecommerce', 'live')
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
		values (${workspaceId}, ${supplierId}, 'stripe', 'acct_supplier_test', 'live', 'yes', 'active')
	`;
	await sql`
		insert into orders (id, workspace_id, sequence, number, status, client_id, client_name, client_email, currency, subtotal_cents, total_cents, environment)
		values (${orderId}, ${workspaceId}, 1, 'ORD-0001', 'placed', ${clientId}, 'Ada', 'ada@example.com', 'CAD', ${RETAIL}, ${RETAIL}, 'live')
	`;
	await sql`
		insert into order_line_items (order_id, catalog_item_id, name, type, quantity, unit_price_cents, line_total_cents, position)
		values (${orderId}, ${catalogItemId}, 'Ethiopia Guji 250g', 'physical', 1, ${RETAIL}, ${RETAIL}, 0)
	`;
	await sql`
		insert into payments (id, workspace_id, order_id, client_id, client_email, provider, environment, status, amount_cents, currency)
		values (${paymentId}, ${workspaceId}, ${orderId}, ${clientId}, 'ada@example.com', 'stripe', 'live', 'succeeded', ${RETAIL}, 'CAD')
	`;
});

const paidEvent = () =>
	({
		id: "evt_paid",
		workspaceId,
		aggregateType: "order",
		aggregateId: orderId,
		eventName: "order.paid",
		payload: { orderId },
	}) as never;

/** Settle through the real handler, so the unwind acts on real state. */
async function settle() {
	const transfer = vi.fn(async (input: { amountCents: number }) => ({
		externalTransferId: "tr_test_1",
		amountCents: input.amountCents,
	}));
	await supplierSettlementHandler(() => {}, transfer).handle(paidEvent());
	return transfer;
}

async function refundOf(cents: number) {
	const sql = testDbClient();
	const [row] = await sql`
		insert into payment_refunds (workspace_id, payment_id, amount_cents, provider, environment)
		values (${workspaceId}, ${paymentId}, ${cents}, 'stripe', 'live')
		returning id
	`;
	return {
		id: "evt_refund",
		workspaceId,
		aggregateType: "payment",
		aggregateId: paymentId,
		eventName: "payment.refunded",
		payload: { paymentId, refundId: row.id, restock: true },
	} as never;
}

describe("a refunded customer pulls the supplier's share back", () => {
	it("reverses the whole supplier cost on a full refund", async () => {
		await settle();
		const reverse = vi.fn(async (i: { amountCents: number }) => ({
			reversedCents: i.amountCents,
		}));
		await supplierRefundHandler(() => {}, reverse).handle(
			await refundOf(RETAIL),
		);

		expect(reverse).toHaveBeenCalledTimes(1);
		// 🔴 1500, what the supplier was SENT — not 2646, what the customer paid.
		expect(reverse.mock.calls[0]?.[0]?.amountCents).toBe(COST);

		const sql = testDbClient();
		const [row] = await sql`
			select status, reversed_cents from supplier_payments where workspace_id = ${workspaceId}
		`;
		expect(Number(row.reversed_cents)).toBe(COST);
		expect(row.status).toBe("reversed");
	});

	/**
	 * ⚠️ Half the customer's money back is half the supplier's share back, not
	 * all of it and not none of it.
	 */
	it("reverses proportionally on a partial refund", async () => {
		await settle();
		const reverse = vi.fn(async (i: { amountCents: number }) => ({
			reversedCents: i.amountCents,
		}));
		await supplierRefundHandler(() => {}, reverse).handle(await refundOf(1323));
		// floor(1500 * 1323 / 2646) = 750
		expect(reverse.mock.calls[0]?.[0]?.amountCents).toBe(750);
	});

	/**
	 * 🔴 Two partial refunds must never pull back more than was sent.
	 */
	it("cannot reverse more than was sent across repeated refunds", async () => {
		await settle();
		const reverse = vi.fn(async (i: { amountCents: number }) => ({
			reversedCents: i.amountCents,
		}));
		const handler = supplierRefundHandler(() => {}, reverse);
		await handler.handle(await refundOf(1323));
		await handler.handle(await refundOf(1323));
		await handler.handle(await refundOf(1323));

		const total = reverse.mock.calls.reduce(
			(sum, call) => sum + (call[0]?.amountCents ?? 0),
			0,
		);
		expect(total).toBeLessThanOrEqual(COST);

		const sql = testDbClient();
		const [row] = await sql`
			select reversed_cents from supplier_payments where workspace_id = ${workspaceId}
		`;
		expect(Number(row.reversed_cents)).toBeLessThanOrEqual(COST);
	});

	/**
	 * ⚠️ Nothing was sent yet, so there is nothing to claw back — the obligation
	 * is simply cancelled and the provider is never called.
	 */
	it("cancels an obligation that was never sent, without a reversal", async () => {
		const sql = testDbClient();
		// Settlement refused: the supplier cannot receive yet.
		await sql`
			update supplier_payment_accounts set transfers_enabled = 'no'
			where workspace_id = ${workspaceId}
		`;
		await expect(
			supplierSettlementHandler(
				() => {},
				vi.fn(async () => ({ externalTransferId: "x", amountCents: 0 })),
			).handle(paidEvent()),
		).rejects.toThrow();

		const reverse = vi.fn(async (i: { amountCents: number }) => ({
			reversedCents: i.amountCents,
		}));
		await supplierRefundHandler(() => {}, reverse).handle(
			await refundOf(RETAIL),
		);

		expect(reverse).not.toHaveBeenCalled();
		const [row] = await sql`
			select status from supplier_payments where workspace_id = ${workspaceId}
		`;
		expect(row.status).toBe("cancelled");
	});

	it("does nothing for an order with no supplier", async () => {
		const sql = testDbClient();
		await sql`delete from supplier_skus where workspace_id = ${workspaceId}`;
		const reverse = vi.fn(async (i: { amountCents: number }) => ({
			reversedCents: i.amountCents,
		}));
		await supplierRefundHandler(() => {}, reverse).handle(
			await refundOf(RETAIL),
		);
		expect(reverse).not.toHaveBeenCalled();
	});
});
