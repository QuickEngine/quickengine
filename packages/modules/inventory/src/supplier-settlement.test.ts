import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { raisePurchaseOrdersForOrder } from "./purchase-orders";
import {
	purchaseOrderObligation,
	recordSupplierObligation,
	SupplierSettlementError,
	settlementEligibility,
} from "./supplier-settlement";

const ownerId = "settle-owner";
const workspaceId = "00000000-0000-4000-8000-0000000016a1";
const beanId = "00000000-0000-4000-8000-0000000016b1";
const mugId = "00000000-0000-4000-8000-0000000016b2";
const supplierId = "00000000-0000-4000-8000-0000000016c1";
const orderId = "00000000-0000-4000-8000-0000000016d1";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Settle Owner', 'settle@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Settle Workspace', 'ecommerce')`;
	await sql`insert into catalog_items (id, workspace_id, name, type, status)
		values (${beanId}, ${workspaceId}, 'Ethiopia Guji', 'physical', 'active'),
		       (${mugId}, ${workspaceId}, 'Branded Mug', 'physical', 'active')`;
	await sql`insert into suppliers (id, workspace_id, name, contact_email, handoff_method)
		values (${supplierId}, ${workspaceId}, 'Roaster', 'roaster@example.com', 'email')`;
	// 🔑 $15.00 a bag — the supplier's agreed cost, not what the shop sells for.
	await sql`insert into supplier_skus
		(workspace_id, supplier_id, catalog_item_id, supplier_sku, unit_cost_cents, currency)
		values (${workspaceId}, ${supplierId}, ${beanId}, 'ROAST-ETH', 1500, 'CAD')`;
	await sql`insert into orders
		(id, workspace_id, client_name, sequence, number, status,
		 subtotal_cents, total_cents, currency,
		 ship_to_name, ship_to_line1, ship_to_city, ship_to_country_code)
		values (${orderId}, ${workspaceId}, 'Ada', 9101, 'ORD-9101', 'placed',
			2600, 2600, 'CAD', 'Ada', '1 Hampton Crescent', 'Sylvan Lake', 'CA')`;
	await sql`insert into order_line_items
		(id, order_id, catalog_item_id, name, type, quantity, unit_price_cents, line_total_cents, position)
		values (gen_random_uuid(), ${orderId}, ${beanId}, 'Ethiopia Guji', 'physical', 1, 2600, 2600, 0)`;
});

const raise = async () => {
	const [po] = await raisePurchaseOrdersForOrder({ workspaceId, orderId });
	return po.id;
};

describe("what the supplier is owed", () => {
	/**
	 * 🔴 The whole point. A customer paid $26; the supplier agreed $15. Settling
	 * from retail would hand the supplier the shop's entire margin.
	 */
	it("comes from the purchase order, never from what the customer paid", async () => {
		const purchaseOrderId = await raise();
		const owed = await purchaseOrderObligation(workspaceId, purchaseOrderId);

		expect(owed.amountCents).toBe(1500);
		expect(owed.currency).toBe("CAD");
		expect(owed.amountCents).not.toBe(2600);
	});

	it("multiplies by quantity", async () => {
		const sql = testDbClient();
		await sql`update order_line_items set quantity = 3 where order_id = ${orderId}`;
		const owed = await purchaseOrderObligation(workspaceId, await raise());
		expect(owed.amountCents).toBe(4500);
	});

	/**
	 * ⚠️ Nobody has agreed a price. Settling at zero underpays and settling at
	 * retail overpays; refusing is the only honest answer.
	 */
	it("refuses when a line has no agreed cost", async () => {
		const purchaseOrderId = await raise();
		const sql = testDbClient();
		await sql`update purchase_order_lines set unit_cost_cents = null
			where purchase_order_id = ${purchaseOrderId}`;

		await expect(
			purchaseOrderObligation(workspaceId, purchaseOrderId),
		).rejects.toThrow(SupplierSettlementError);
	});

	it("refuses a purchase order whose lines disagree about currency", async () => {
		const purchaseOrderId = await raise();
		const sql = testDbClient();
		await sql`insert into purchase_order_lines
			(purchase_order_id, supplier_sku, description, quantity, unit_cost_cents, currency)
			values (${purchaseOrderId}, 'IMPORT-1', 'Imported bag', 1, 900, 'USD')`;

		await expect(
			purchaseOrderObligation(workspaceId, purchaseOrderId),
		).rejects.toThrow(/MIXED_CURRENCY/);
	});
});

describe("recording the obligation", () => {
	/**
	 * 🔴 The failure with no automatic remedy. `order.paid` is redelivered up to
	 * eight times, and a settlement raised per delivery pays the supplier eight
	 * times for one sale — money that has left, recoverable only by asking.
	 */
	it("records once, however many times the paid event arrives", async () => {
		const purchaseOrderId = await raise();
		const input = {
			workspaceId,
			purchaseOrderId,
			orderId,
			environment: "live" as const,
		};

		const first = await recordSupplierObligation(input);
		const second = await recordSupplierObligation(input);
		const third = await recordSupplierObligation(input);

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(third.created).toBe(false);
		expect(second.id).toBe(first.id);
		expect(third.id).toBe(first.id);

		const sql = testDbClient();
		const rows = await sql`select count(*)::int n from supplier_payments
			where purchase_order_id = ${purchaseOrderId}`;
		expect(rows[0].n).toBe(1);
	});

	it("starts owed but unsent, and leaves an audit entry", async () => {
		const purchaseOrderId = await raise();
		const { id } = await recordSupplierObligation({
			workspaceId,
			purchaseOrderId,
			orderId,
			environment: "live",
		});

		const sql = testDbClient();
		const [row] = await sql`select status, amount_cents, idempotency_key
			from supplier_payments where id = ${id}`;
		expect(row.status).toBe("calculated");
		expect(row.amount_cents).toBe(1500);
		// Derived, so every retry presents the same key rather than asking for a
		// second, different payment.
		expect(row.idempotency_key).toBe(`supplier-payment:${purchaseOrderId}`);

		const events = await sql`select kind from supplier_payment_events
			where supplier_payment_id = ${id}`;
		expect(events.map((e) => (e as { kind: string }).kind)).toContain(
			"calculated",
		);
	});
});

describe("whether it may actually be sent", () => {
	const onboard = async (opts: {
		transfers: string;
		status: string;
		environment?: string;
	}) => {
		const sql = testDbClient();
		await sql`insert into supplier_payment_accounts
			(workspace_id, supplier_id, provider, external_account_id, environment, transfers_enabled, status)
			values (${workspaceId}, ${supplierId}, 'stripe', 'acct_supplier',
				${opts.environment ?? "live"}, ${opts.transfers}, ${opts.status})`;
	};

	it("refuses when the supplier has never onboarded", async () => {
		const { id } = await recordSupplierObligation({
			workspaceId,
			purchaseOrderId: await raise(),
			orderId,
			environment: "live",
		});
		const check = await settlementEligibility(workspaceId, id);
		expect(check).toMatchObject({
			eligible: false,
			reason: "SUPPLIER_NOT_ONBOARDED",
		});
	});

	/**
	 * ⚠️ An account can exist, look connected, and still refuse a transfer
	 * because onboarding is unfinished.
	 */
	it("refuses when the supplier cannot receive money yet", async () => {
		await onboard({ transfers: "no", status: "active" });
		const { id } = await recordSupplierObligation({
			workspaceId,
			purchaseOrderId: await raise(),
			orderId,
			environment: "live",
		});
		const check = await settlementEligibility(workspaceId, id);
		expect(check).toMatchObject({
			eligible: false,
			reason: "SUPPLIER_CANNOT_RECEIVE_YET",
		});
	});

	/** 🔴 A test recipient must never be reachable from live. */
	it("refuses across environments", async () => {
		await onboard({ transfers: "yes", status: "active", environment: "test" });
		const { id } = await recordSupplierObligation({
			workspaceId,
			purchaseOrderId: await raise(),
			orderId,
			environment: "live",
		});
		const check = await settlementEligibility(workspaceId, id);
		expect(check).toMatchObject({
			eligible: false,
			reason: "SUPPLIER_NOT_ONBOARDED",
		});
	});

	it("refuses one that already succeeded", async () => {
		await onboard({ transfers: "yes", status: "active" });
		const { id } = await recordSupplierObligation({
			workspaceId,
			purchaseOrderId: await raise(),
			orderId,
			environment: "live",
		});
		const sql = testDbClient();
		await sql`update supplier_payments set status = 'succeeded' where id = ${id}`;
		expect(await settlementEligibility(workspaceId, id)).toMatchObject({
			eligible: false,
			reason: "ALREADY_SETTLED",
		});
	});

	/**
	 * 🔴 A row stuck in `initiated` means a provider may already hold the
	 * request. Retrying blindly is how one obligation becomes two payments.
	 */
	it("refuses one that is already in flight", async () => {
		await onboard({ transfers: "yes", status: "active" });
		const { id } = await recordSupplierObligation({
			workspaceId,
			purchaseOrderId: await raise(),
			orderId,
			environment: "live",
		});
		const sql = testDbClient();
		await sql`update supplier_payments set status = 'initiated' where id = ${id}`;
		expect(await settlementEligibility(workspaceId, id)).toMatchObject({
			eligible: false,
			reason: "IN_FLIGHT",
		});
	});

	it("allows one that is owed, onboarded and unsent", async () => {
		await onboard({ transfers: "yes", status: "active" });
		const { id } = await recordSupplierObligation({
			workspaceId,
			purchaseOrderId: await raise(),
			orderId,
			environment: "live",
		});
		expect(await settlementEligibility(workspaceId, id)).toMatchObject({
			eligible: true,
			amountCents: 1500,
			destinationAccountId: "acct_supplier",
		});
	});

	/** ⚠️ Another workspace's obligation is not readable, let alone payable. */
	it("refuses across workspaces", async () => {
		await onboard({ transfers: "yes", status: "active" });
		const { id } = await recordSupplierObligation({
			workspaceId,
			purchaseOrderId: await raise(),
			orderId,
			environment: "live",
		});
		const other = "00000000-0000-4000-8000-0000000016f9";
		expect(await settlementEligibility(other, id)).toMatchObject({
			eligible: false,
			reason: "OBLIGATION_NOT_FOUND",
		});
	});
});
