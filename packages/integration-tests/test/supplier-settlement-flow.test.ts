import { testDbClient } from "@quickengine/db/testing";
import {
	settlePendingSupplierPayments,
	supplierSettlementHandler,
} from "@quickengine/event-dispatch";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A paid order pays its supplier, once, without anybody doing anything.
 *
 * 🔴 This is the test that proves the rail exists at all. Until the settlement
 * handler was registered, checkout held the supplier's share back as the
 * charge's application fee and NOTHING ever sent it on — QuickEngine collected a
 * supplier's money and kept it. Every piece existed and none of them was called.
 *
 * ⚠️ The transfer function is injected. Money movement cannot be exercised
 * honestly against a real provider in a test suite, and the seam is what lets
 * the duplicate delivery be reproduced deterministically.
 */

const owner = "settle-owner";
const workspaceId = "00000000-0000-4000-8000-000000150001";
const clientId = "00000000-0000-4000-8000-000000150002";
const orderId = "00000000-0000-4000-8000-000000150003";
const catalogItemId = "00000000-0000-4000-8000-000000150004";
const supplierId = "00000000-0000-4000-8000-000000150005";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Asher', 'settle@example.com', true)
	`;
	// LIVE, because sandbox deliberately refuses to reach a real supplier.
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
	// 🔑 $15.00 CAD — the supplier's agreed COST, not the retail price below.
	await sql`
		insert into supplier_skus (workspace_id, supplier_id, catalog_item_id, supplier_sku, unit_cost_cents, currency)
		values (${workspaceId}, ${supplierId}, ${catalogItemId}, 'EZPZ-GUJI-250', 1500, 'CAD')
	`;
	// The supplier's connected account, ready to receive.
	await sql`
		insert into supplier_payment_accounts (workspace_id, supplier_id, provider, external_account_id, environment, transfers_enabled, status)
		values (${workspaceId}, ${supplierId}, 'stripe', 'acct_supplier_test', 'live', 'yes', 'active')
	`;
	// Retail 26.46 — deliberately different from the 15.00 cost.
	await sql`
		insert into orders (id, workspace_id, sequence, number, status, client_id, client_name, client_email, currency, subtotal_cents, total_cents, environment)
		values (${orderId}, ${workspaceId}, 1, 'ORD-0001', 'placed', ${clientId}, 'Ada', 'ada@example.com', 'CAD', 2646, 2646, 'live')
	`;
	await sql`
		insert into order_line_items (order_id, catalog_item_id, name, type, quantity, unit_price_cents, line_total_cents, position)
		values (${orderId}, ${catalogItemId}, 'Ethiopia Guji 250g', 'physical', 1, 2646, 2646, 0)
	`;
});

const paidEvent = () =>
	({
		id: "evt_order_paid_1",
		workspaceId,
		aggregateType: "order",
		aggregateId: orderId,
		eventName: "order.paid",
		payload: { orderId },
	}) as never;

const transferOk = () =>
	vi.fn(async (input: { amountCents: number }) => ({
		externalTransferId: "tr_test_1",
		amountCents: input.amountCents,
	}));

describe("a paid order settles its supplier", () => {
	it("transfers exactly the supplier cost, not the retail price", async () => {
		const transfer = transferOk();
		await supplierSettlementHandler(() => {}, transfer).handle(paidEvent());

		expect(transfer).toHaveBeenCalledTimes(1);
		const call = transfer.mock.calls[0]?.[0] as unknown as {
			amountCents: number;
			currency: string;
			destinationAccountId: string;
			description: string;
			idempotencyKey: string;
		};
		// 🔴 1500, the agreed cost — NOT 2646, what the customer paid.
		expect(call.amountCents).toBe(1500);
		expect(call.currency).toBe("CAD");
		expect(call.destinationAccountId).toBe("acct_supplier_test");
	});

	/**
	 * 🔴 What the supplier reads. Names the BUSINESS and its order, never
	 * QuickEngine — Stripe already shows its own application name on their side
	 * and that cannot be suppressed.
	 */
	it("labels the money with the business and the order", async () => {
		const transfer = transferOk();
		await supplierSettlementHandler(() => {}, transfer).handle(paidEvent());
		const call = transfer.mock.calls[0]?.[0] as unknown as {
			description: string;
		};
		expect(call.description).toBe(
			"Caffeinate — Order ORD-0001 supplier settlement",
		);
	});

	/**
	 * 🔴 The outbox redelivers `order.paid` up to eight times. Without the unique
	 * index on `purchase_order_id` this is where a supplier gets paid eight times
	 * for one sale.
	 */
	it("cannot pay twice when the event is redelivered", async () => {
		const transfer = transferOk();
		const handler = supplierSettlementHandler(() => {}, transfer);
		await handler.handle(paidEvent());
		await handler.handle(paidEvent());
		await handler.handle(paidEvent());

		expect(transfer).toHaveBeenCalledTimes(1);

		const sql = testDbClient();
		const rows = await sql`
			select status, amount_cents, external_transfer_id
			from supplier_payments where workspace_id = ${workspaceId}
		`;
		expect(rows).toHaveLength(1);
		expect(rows[0].status).toBe("succeeded");
		expect(Number(rows[0].amount_cents)).toBe(1500);
		expect(rows[0].external_transfer_id).toBe("tr_test_1");
	});

	it("uses an idempotency key derived from the purchase order", async () => {
		const transfer = transferOk();
		await supplierSettlementHandler(() => {}, transfer).handle(paidEvent());
		const call = transfer.mock.calls[0]?.[0] as unknown as {
			idempotencyKey: string;
		};
		const sql = testDbClient();
		const [po] = await sql`
			select id from purchase_orders where workspace_id = ${workspaceId}
		`;
		expect(call.idempotencyKey).toBe(`supplier-payment:${po.id}`);
	});

	/**
	 * ⚠️ A supplier who has not finished connecting is a RETRYABLE refusal: the
	 * handler throws so the outbox tries again with backoff, and no money moves.
	 */
	/**
	 * 🔴 It must NOT throw. This handler used to, so the outbox would retry — and
	 * the drain re-runs every OTHER handler on retry, so the customer was emailed
	 * their order confirmation once per attempt. Four identical emails reached a
	 * real inbox on 2026-08-28 before it was stopped by hand.
	 */
	it("does not pay, and does not throw, when the supplier cannot receive yet", async () => {
		const sql = testDbClient();
		await sql`
			update supplier_payment_accounts set transfers_enabled = 'no'
			where workspace_id = ${workspaceId}
		`;
		const transfer = transferOk();
		await expect(
			supplierSettlementHandler(() => {}, transfer).handle(paidEvent()),
		).resolves.toBeUndefined();
		expect(transfer).not.toHaveBeenCalled();

		// Left for the sweep, not abandoned.
		const [row] = await sql`
			select status from supplier_payments where workspace_id = ${workspaceId}
		`;
		expect(row.status).toBe("calculated");
	});

	/**
	 * 🔑 The sweep is the only thing that pays a supplier who finishes onboarding
	 * after the order was placed. The outbox gives up after eight attempts; this
	 * has no such horizon.
	 */
	it("settles later, once the supplier can receive", async () => {
		const sql = testDbClient();
		await sql`
			update supplier_payment_accounts set transfers_enabled = 'no'
			where workspace_id = ${workspaceId}
		`;
		await supplierSettlementHandler(() => {}, transferOk()).handle(paidEvent());

		// The supplier finishes connecting their account, days later.
		await sql`
			update supplier_payment_accounts set transfers_enabled = 'yes'
			where workspace_id = ${workspaceId}
		`;
		const transfer = transferOk();
		const result = await settlePendingSupplierPayments({
			transferer: transfer,
		});

		expect(result.settled).toBe(1);
		expect(transfer).toHaveBeenCalledTimes(1);
		expect(transfer.mock.calls[0]?.[0]?.amountCents).toBe(1500);

		const [row] = await sql`
			select status from supplier_payments where workspace_id = ${workspaceId}
		`;
		expect(row.status).toBe("succeeded");
	});

	/** ⚠️ Running the sweep repeatedly must never pay twice. */
	it("is safe to sweep again", async () => {
		await supplierSettlementHandler(() => {}, transferOk()).handle(paidEvent());
		const transfer = transferOk();
		await settlePendingSupplierPayments({ transferer: transfer });
		await settlePendingSupplierPayments({ transferer: transfer });
		// Already succeeded during the handler, so the sweep has nothing to do.
		expect(transfer).not.toHaveBeenCalled();
	});
});
