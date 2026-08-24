import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { raisePurchaseOrdersForOrder } from "./purchase-orders";
import { recordSupplierObligation } from "./supplier-settlement";
import {
	settleSupplierPayment,
	unwindSupplierPayment,
} from "./supplier-settlement-run";

const ownerId = "run-owner";
const workspaceId = "00000000-0000-4000-8000-0000000017a1";
const beanId = "00000000-0000-4000-8000-0000000017b1";
const supplierId = "00000000-0000-4000-8000-0000000017c1";
const orderId = "00000000-0000-4000-8000-0000000017d1";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Run Owner', 'run@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Run Workspace', 'ecommerce')`;
	await sql`insert into catalog_items (id, workspace_id, name, type, status)
		values (${beanId}, ${workspaceId}, 'Ethiopia Guji', 'physical', 'active')`;
	await sql`insert into suppliers (id, workspace_id, name, contact_email, handoff_method)
		values (${supplierId}, ${workspaceId}, 'Roaster', 'roaster@example.com', 'email')`;
	await sql`insert into supplier_skus
		(workspace_id, supplier_id, catalog_item_id, supplier_sku, unit_cost_cents, currency)
		values (${workspaceId}, ${supplierId}, ${beanId}, 'ROAST-ETH', 1500, 'CAD')`;
	await sql`insert into supplier_payment_accounts
		(workspace_id, supplier_id, provider, external_account_id, environment, transfers_enabled, status)
		values (${workspaceId}, ${supplierId}, 'stripe', 'acct_supplier', 'live', 'yes', 'active')`;
	await sql`insert into orders
		(id, workspace_id, client_name, sequence, number, status,
		 subtotal_cents, total_cents, currency,
		 ship_to_name, ship_to_line1, ship_to_city, ship_to_country_code)
		values (${orderId}, ${workspaceId}, 'Ada', 9201, 'ORD-9201', 'placed',
			2600, 2600, 'CAD', 'Ada', '1 Hampton Crescent', 'Sylvan Lake', 'CA')`;
	await sql`insert into order_line_items
		(id, order_id, catalog_item_id, name, type, quantity, unit_price_cents, line_total_cents, position)
		values (gen_random_uuid(), ${orderId}, ${beanId}, 'Ethiopia Guji', 'physical', 1, 2600, 2600, 0)`;
});

const owe = async () => {
	const [po] = await raisePurchaseOrdersForOrder({ workspaceId, orderId });
	const rec = await recordSupplierObligation({
		workspaceId,
		purchaseOrderId: po.id,
		orderId,
		environment: "live",
	});
	return { supplierPaymentId: rec.id, purchaseOrderId: po.id };
};

const ok = (id = "tr_1") =>
	vi.fn(async (i: { amountCents: number }) => ({
		externalTransferId: id,
		amountCents: i.amountCents,
	}));

describe("settling a supplier", () => {
	it("sends the purchase order amount, not what the customer paid", async () => {
		const { supplierPaymentId } = await owe();
		const transfer = ok();

		const result = await settleSupplierPayment(
			workspaceId,
			supplierPaymentId,
			transfer,
		);

		expect(result).toMatchObject({ settled: true, externalTransferId: "tr_1" });
		expect(transfer).toHaveBeenCalledTimes(1);
		expect(transfer.mock.calls[0][0]).toMatchObject({
			amountCents: 1500,
			currency: "CAD",
			destinationAccountId: "acct_supplier",
		});
	});

	/**
	 * 🔴 The failure with no automatic remedy. Two workers, one obligation — the
	 * claim must produce exactly one winner before either calls the provider.
	 */
	it("pays once when two workers race", async () => {
		const { supplierPaymentId } = await owe();
		const transfer = ok();

		const [a, b] = await Promise.all([
			settleSupplierPayment(workspaceId, supplierPaymentId, transfer),
			settleSupplierPayment(workspaceId, supplierPaymentId, transfer),
		]);

		const settled = [a, b].filter((r) => r.settled);
		expect(settled).toHaveLength(1);
		expect(transfer).toHaveBeenCalledTimes(1);
	});

	it("refuses to send twice, even much later", async () => {
		const { supplierPaymentId } = await owe();
		const transfer = ok();
		await settleSupplierPayment(workspaceId, supplierPaymentId, transfer);

		const again = await settleSupplierPayment(
			workspaceId,
			supplierPaymentId,
			transfer,
		);
		expect(again).toMatchObject({ settled: false, reason: "ALREADY_SETTLED" });
		expect(transfer).toHaveBeenCalledTimes(1);
	});

	/**
	 * 🔴 The crash this whole design exists for: the provider succeeded, we died
	 * before recording it. The retry must present the SAME key so the provider
	 * returns the original transfer instead of making a second one.
	 */
	it("presents the same idempotency key on every attempt", async () => {
		const { supplierPaymentId, purchaseOrderId } = await owe();
		const transfer = ok();
		await settleSupplierPayment(workspaceId, supplierPaymentId, transfer);

		expect(transfer.mock.calls[0][0]).toMatchObject({
			idempotencyKey: `supplier-payment:${purchaseOrderId}`,
		});
	});

	/** ⚠️ A refusal is final; the row must not sit pretending to be in flight. */
	it("marks a refused transfer as failed", async () => {
		const { supplierPaymentId } = await owe();
		const transfer = vi.fn(async () => {
			throw Object.assign(new Error("destination cannot accept"), {
				code: "account_invalid",
				retryable: false,
			});
		});

		const result = await settleSupplierPayment(
			workspaceId,
			supplierPaymentId,
			transfer,
		);
		expect(result).toMatchObject({ settled: false, retryable: false });

		const sql = testDbClient();
		const [row] =
			await sql`select status, failure_code from supplier_payments where id = ${supplierPaymentId}`;
		expect(row.status).toBe("failed");
		expect(row.failure_code).toBe("account_invalid");
	});

	/**
	 * 🔴 A network error is NOT a refusal. The request may have arrived and
	 * succeeded, so the row stays `initiated` for reconciliation rather than
	 * being retried into a second payment.
	 */
	it("leaves an uncertain transfer in flight rather than retrying it", async () => {
		const { supplierPaymentId } = await owe();
		const transfer = vi.fn(async () => {
			throw Object.assign(new Error("connection reset"), {
				code: "api_connection_error",
				retryable: true,
			});
		});

		await settleSupplierPayment(workspaceId, supplierPaymentId, transfer);

		const sql = testDbClient();
		const [row] =
			await sql`select status from supplier_payments where id = ${supplierPaymentId}`;
		expect(row.status).toBe("initiated");

		// And a later attempt refuses rather than sending again.
		const again = await settleSupplierPayment(
			workspaceId,
			supplierPaymentId,
			ok("tr_2"),
		);
		expect(again).toMatchObject({ settled: false, reason: "IN_FLIGHT" });
	});
});

describe("when the customer's money goes back", () => {
	it("cancels an obligation that was never sent", async () => {
		const { purchaseOrderId } = await owe();

		const result = await unwindSupplierPayment({
			workspaceId,
			purchaseOrderId,
			refundedCents: 2600,
			reason: "customer refund",
		});

		expect(result).toMatchObject({ outcome: "cancelled" });
		const sql = testDbClient();
		const [row] =
			await sql`select status from supplier_payments where purchase_order_id = ${purchaseOrderId}`;
		expect(row.status).toBe("cancelled");
	});

	it("reverses one that was already sent", async () => {
		const { supplierPaymentId, purchaseOrderId } = await owe();
		await settleSupplierPayment(workspaceId, supplierPaymentId, ok());

		const reverse = vi.fn(async (i: { amountCents: number }) => ({
			reversedCents: i.amountCents,
		}));
		const result = await unwindSupplierPayment({
			workspaceId,
			purchaseOrderId,
			refundedCents: 2600,
			reason: "customer refund",
			reverse,
		});

		expect(result).toMatchObject({ outcome: "reversed", reversedCents: 1500 });
		const sql = testDbClient();
		const [row] =
			await sql`select status, reversed_cents from supplier_payments where id = ${supplierPaymentId}`;
		expect(row.status).toBe("reversed");
		expect(row.reversed_cents).toBe(1500);
	});

	/**
	 * ⚠️ A customer refunded part of their order does not undo the whole supplier
	 * obligation, and a second partial refund must not pull back more than remains.
	 */
	it("pulls back only what the refund covers, and never more than remains", async () => {
		const { supplierPaymentId, purchaseOrderId } = await owe();
		await settleSupplierPayment(workspaceId, supplierPaymentId, ok());
		const reverse = vi.fn(async (i: { amountCents: number }) => ({
			reversedCents: i.amountCents,
		}));

		const first = await unwindSupplierPayment({
			workspaceId,
			purchaseOrderId,
			refundedCents: 500,
			reason: "partial",
			reverse,
		});
		expect(first).toMatchObject({ outcome: "reversed", reversedCents: 500 });

		// Asking for far more than is left pulls back only the remainder.
		const second = await unwindSupplierPayment({
			workspaceId,
			purchaseOrderId,
			refundedCents: 9999,
			reason: "rest",
			reverse,
		});
		expect(second).toMatchObject({ outcome: "reversed", reversedCents: 1000 });

		const sql = testDbClient();
		const [row] =
			await sql`select status, reversed_cents from supplier_payments where id = ${supplierPaymentId}`;
		expect(row.reversed_cents).toBe(1500);
		expect(row.status).toBe("reversed");
	});

	/**
	 * 🔴 The money has reached the supplier's bank. No API recovers it — recorded
	 * as owed back rather than pretending the ledger is square.
	 */
	it("records an unrecoverable amount when reversal is refused", async () => {
		const { supplierPaymentId, purchaseOrderId } = await owe();
		await settleSupplierPayment(workspaceId, supplierPaymentId, ok());
		const reverse = vi.fn(async () => {
			throw new Error("funds already paid out");
		});

		const result = await unwindSupplierPayment({
			workspaceId,
			purchaseOrderId,
			refundedCents: 1500,
			reason: "chargeback",
			reverse,
		});

		expect(result).toMatchObject({
			outcome: "unrecoverable",
			owedBackCents: 1500,
		});
		const sql = testDbClient();
		const [row] =
			await sql`select status, failure_code from supplier_payments where id = ${supplierPaymentId}`;
		// 🔴 Still `succeeded` — it WAS paid. "Paid then clawed back" and "never
		// paid" are different facts and a supplier disputing needs the first.
		expect(row.status).toBe("succeeded");
		expect(row.failure_code).toBe("REVERSAL_FAILED");
	});
});
