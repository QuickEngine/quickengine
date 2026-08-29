import { testDbClient } from "@quickengine/db/testing";
import { reconcileSupplierPayments } from "@quickengine/event-dispatch";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What actually happened to the money we sent a supplier.
 *
 * 🔴 Two states were unresolvable and both cost a real supplier real money.
 *
 * A settlement that never heard back leaves the row `initiated`. The transfer
 * may have been made — the supplier may already be paid — or it may never have
 * landed. The settlement sweep refuses to touch these, correctly: retrying one
 * that already worked pays a supplier twice out of the business's own pocket.
 *
 * And a transfer marked `succeeded` can be taken back afterwards — a disputed
 * source charge, a recovered platform balance. Nothing read it again, so the
 * supplier was unpaid while our books said otherwise.
 *
 * ⚠️ The provider reads are injected. Nothing here opens a socket, and the
 * uncertain case can be reproduced deterministically rather than hoped for.
 */

const owner = "recon-owner";
const workspaceId = "00000000-0000-4000-8000-0000001d0001";
const supplierId = "00000000-0000-4000-8000-0000001d0002";
const purchaseOrderId = "00000000-0000-4000-8000-0000001d0003";
const orderId = "00000000-0000-4000-8000-0000001d0004";
const clientId = "00000000-0000-4000-8000-0000001d0005";
const paymentId = "00000000-0000-4000-8000-0000001d0006";

/** Older than the grace period, so the pass treats it as uncertain. */
const LONG_AGO = new Date(Date.now() - 60 * 60 * 1000);

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Asher', 'recon@example.com', true)
		on conflict (id) do nothing
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type, environment)
		values (${workspaceId}, ${owner}, 'Caffeinate', 'ecommerce', 'live')
		on conflict (id) do nothing
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientId}, ${workspaceId}, 'Ada', 'ada@example.com')
		on conflict (id) do nothing
	`;
	await sql`
		insert into orders (id, workspace_id, sequence, number, status, client_id, client_name, client_email, currency, subtotal_cents, total_cents, environment)
		values (${orderId}, ${workspaceId}, 1, 'CAF-0001', 'placed', ${clientId}, 'Ada', 'ada@example.com', 'CAD', 2999, 2999, 'live')
		on conflict (id) do nothing
	`;
	await sql`
		insert into suppliers (id, workspace_id, name, handoff_method)
		values (${supplierId}, ${workspaceId}, 'EZPZ Coffee', 'manual')
		on conflict (id) do nothing
	`;
	await sql`
		insert into purchase_orders (id, workspace_id, supplier_id, order_id, number, status, handoff_method)
		values (${purchaseOrderId}, ${workspaceId}, ${supplierId}, ${orderId}, 'PO-0001', 'sent', 'manual')
		on conflict (id) do nothing
	`;
	await sql`
		insert into supplier_payment_accounts (workspace_id, supplier_id, provider, external_account_id, environment, status)
		values (${workspaceId}, ${supplierId}, 'stripe', 'acct_supplier', 'live', 'active')
		on conflict do nothing
	`;
	await sql`delete from supplier_payments where workspace_id = ${workspaceId}`;
});

async function givenPayment(fields: {
	status: string;
	externalTransferId?: string | null;
	reversedCents?: number;
}) {
	const sql = testDbClient();
	await sql`
		insert into supplier_payments
			(id, workspace_id, supplier_id, purchase_order_id, order_id, amount_cents,
			 currency, environment, status, provider, idempotency_key,
			 external_transfer_id, reversed_cents, created_at)
		values
			(${paymentId}, ${workspaceId}, ${supplierId}, ${purchaseOrderId}, ${orderId}, 1500,
			 'CAD', 'live', ${fields.status}, 'stripe', ${`idem-${paymentId}`},
			 ${fields.externalTransferId ?? null}, ${fields.reversedCents ?? 0}, ${LONG_AGO})
	`;
}

async function paymentRow() {
	const sql = testDbClient();
	const [row] = await sql`
		select status, external_transfer_id, reversed_cents
		from supplier_payments where id = ${paymentId}
	`;
	return row as {
		status: string;
		external_transfer_id: string | null;
		reversed_cents: number;
	};
}

describe("reconciling a supplier payment", () => {
	/** 🔴 The dangerous one: money may already have moved and we never recorded it. */
	it("adopts a transfer the provider made but we never wrote down", async () => {
		await givenPayment({ status: "initiated", externalTransferId: null });
		const finder = vi.fn(async () => ({
			externalTransferId: "tr_found",
			amountCents: 1500,
			reversedCents: 0,
		}));

		const result = await reconcileSupplierPayments({
			reader: vi.fn(async () => null),
			finder,
		});

		expect(finder).toHaveBeenCalledTimes(1);
		expect(result.adopted).toBe(1);
		const row = await paymentRow();
		expect(row.status).toBe("succeeded");
		expect(row.external_transfer_id).toBe("tr_found");
	});

	/**
	 * 🔴 Left `initiated`, never `failed`. "Not found yet" is not "did not
	 * happen", and marking it failed would free the sweep to pay a second time.
	 */
	it("leaves an uncertain payment alone when the provider has nothing", async () => {
		await givenPayment({ status: "initiated", externalTransferId: null });

		const result = await reconcileSupplierPayments({
			reader: vi.fn(async () => null),
			finder: vi.fn(async () => null),
		});

		expect(result.missing).toBe(1);
		expect((await paymentRow()).status).toBe("initiated");
	});

	/** 🔴 The silent one: paid, then taken back, and our books never noticed. */
	it("records a transfer the provider reversed after we settled it", async () => {
		await givenPayment({ status: "succeeded", externalTransferId: "tr_1" });

		const result = await reconcileSupplierPayments({
			reader: vi.fn(async () => ({
				externalTransferId: "tr_1",
				amountCents: 1500,
				reversedCents: 1500,
			})),
			finder: vi.fn(async () => null),
		});

		expect(result.reversed).toBe(1);
		const row = await paymentRow();
		expect(row.status).toBe("reversed");
		expect(row.reversed_cents).toBe(1500);
	});

	/** ⚠️ A part-reversal is still owed money, so it must not read as settled-and-done. */
	it("keeps a part-reversed transfer settled while recording what came back", async () => {
		await givenPayment({ status: "succeeded", externalTransferId: "tr_2" });

		await reconcileSupplierPayments({
			reader: vi.fn(async () => ({
				externalTransferId: "tr_2",
				amountCents: 1500,
				reversedCents: 500,
			})),
			finder: vi.fn(async () => null),
		});

		const row = await paymentRow();
		expect(row.status).toBe("succeeded");
		expect(row.reversed_cents).toBe(500);
	});

	it("confirms a healthy transfer without changing it", async () => {
		await givenPayment({ status: "succeeded", externalTransferId: "tr_3" });

		const result = await reconcileSupplierPayments({
			reader: vi.fn(async () => ({
				externalTransferId: "tr_3",
				amountCents: 1500,
				reversedCents: 0,
			})),
			finder: vi.fn(async () => null),
		});

		expect(result.confirmed).toBe(1);
		expect((await paymentRow()).status).toBe("succeeded");
	});

	/**
	 * 🔴 It must never SEND money. Paying is the sweep's job; keeping them apart
	 * is what stops a bug here becoming a double payment.
	 */
	it("never settles a payment that has not been sent", async () => {
		await givenPayment({ status: "calculated", externalTransferId: null });
		const finder = vi.fn(async () => null);

		const result = await reconcileSupplierPayments({
			reader: vi.fn(async () => null),
			finder,
		});

		expect(result.considered).toBe(0);
		expect(finder).not.toHaveBeenCalled();
		expect((await paymentRow()).status).toBe("calculated");
	});

	/** ⚠️ A settlement still in flight must not have its transfer adopted underneath it. */
	it("ignores a payment too young to be uncertain", async () => {
		const sql = testDbClient();
		await givenPayment({ status: "initiated", externalTransferId: null });
		await sql`update supplier_payments set created_at = now() where id = ${paymentId}`;

		const result = await reconcileSupplierPayments({
			reader: vi.fn(async () => null),
			finder: vi.fn(async () => null),
		});

		expect(result.considered).toBe(0);
	});

	/** One unreadable row must not stop the pass. */
	it("carries on when the provider throws for one payment", async () => {
		await givenPayment({ status: "succeeded", externalTransferId: "tr_4" });

		const result = await reconcileSupplierPayments({
			reader: vi.fn(async () => {
				throw new Error("stripe unavailable");
			}),
			finder: vi.fn(async () => null),
		});

		expect(result.considered).toBe(1);
		expect((await paymentRow()).status).toBe("succeeded");
	});
});
