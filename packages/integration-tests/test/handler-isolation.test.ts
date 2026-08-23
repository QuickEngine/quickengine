import { testDbClient } from "@quickengine/db/testing";
import {
	customerNotificationHandler,
	operatorNotificationHandler,
	referralSettlementHandler,
	refundRestockHandler,
	subscriptionPaymentMethodHandler,
	supplierHandoffHandler,
} from "@quickengine/event-dispatch";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 🔴 The half of the system the route sweep cannot reach.
 *
 * `services/api/src/tenant-isolation.test.ts` drives all ~339 HTTP routes with a
 * session belonging to no workspace, and fails the build if any answers with
 * data. Outbox handlers have **no session at all**: they are handed a workspace
 * and a payload, and an id inside a payload is a claim rather than a fact.
 *
 * `check:handler-isolation` proves every read NAMES a workspace. That is a
 * regex, and a regex can be satisfied by naming the wrong one. These tests prove
 * the BEHAVIOUR: a handler for workspace A, handed workspace B's record, must do
 * nothing at all.
 *
 * ⚠️ The attack is not hypothetical in shape. Ten reads across five handlers
 * looked records up by id alone until 2026-08-22, including the one that
 * resolves the email address a customer receives an order's contents at.
 */

const ownerA = "iso-owner-a";
const ownerB = "iso-owner-b";
const workspaceA = "00000000-0000-4000-8000-00000013a001";
const workspaceB = "00000000-0000-4000-8000-00000013b001";
const clientB = "00000000-0000-4000-8000-00000013b002";
const orderB = "00000000-0000-4000-8000-00000013b003";
const paymentB = "00000000-0000-4000-8000-00000013b004";
const catalogItemB = "00000000-0000-4000-8000-00000013b005";
const supplierB = "00000000-0000-4000-8000-00000013b006";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified) values
			(${ownerA}, 'Owner A', 'iso-a@example.com', true),
			(${ownerB}, 'Owner B', 'iso-b@example.com', true)
	`;
	/**
	 * ⚠️ B is a SANDBOX workspace, deliberately.
	 *
	 * The supplier positive control below needs the handler to run all the way
	 * through raising a purchase order and then STOP. In a live workspace the next
	 * step is an outbound call to a real supplier; in sandbox it is refused and
	 * logged. That gives a deterministic, offline positive control instead of a
	 * test that depends on a network failure to pass.
	 */
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type, environment) values
			(${workspaceA}, ${ownerA}, 'Caffeinate', 'ecommerce', 'live'),
			(${workspaceB}, ${ownerB}, 'Gemsutopia', 'ecommerce', 'test')
	`;
	// Everything below belongs to B. A must never reach any of it.
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientB}, ${workspaceB}, 'Reese', 'reese@gemsutopia.example')
	`;
	await sql`
		insert into orders (id, workspace_id, sequence, number, status, client_id, client_name, client_email, currency, subtotal_cents, total_cents)
		values (${orderB}, ${workspaceB}, 1001, 'GEM-1001', 'placed', ${clientB}, 'Reese', 'reese@gemsutopia.example', 'CAD', 9900, 9900)
	`;
	await sql`
		insert into payments (id, workspace_id, order_id, client_id, client_email, provider, environment, status, amount_cents, currency)
		values (${paymentB}, ${workspaceB}, ${orderB}, ${clientB}, 'reese@gemsutopia.example', 'stripe', 'test', 'refunded', 9900, 'CAD')
	`;
	/**
	 * 🔴 Without all four of these the supplier test proves NOTHING.
	 *
	 * A purchase order needs a line item, a catalog item behind it, a supplier,
	 * and a mapping between them. With any one missing the handler raises nothing
	 * whether or not it checks the workspace — so the negative test passes for the
	 * wrong reason and would keep passing after the isolation was removed.
	 */
	await sql`
		insert into catalog_items (id, workspace_id, name, type)
		values (${catalogItemB}, ${workspaceB}, 'Ethiopia Guji 1kg', 'product')
	`;
	await sql`
		insert into suppliers (id, workspace_id, name)
		values (${supplierB}, ${workspaceB}, 'EZPZ Coffee')
	`;
	await sql`
		insert into supplier_skus (workspace_id, supplier_id, catalog_item_id, supplier_sku)
		values (${workspaceB}, ${supplierB}, ${catalogItemB}, 'EZPZ-GUJI-1KG')
	`;
	await sql`
		insert into order_line_items (order_id, catalog_item_id, name, type, quantity, unit_price_cents, line_total_cents, position)
		values (${orderB}, ${catalogItemB}, 'Ethiopia Guji 1kg', 'product', 1, 9900, 9900, 0)
	`;
});

/** An event that claims workspace A but names workspace B's record. */
const forgedEvent = (over: Record<string, unknown> = {}) =>
	({
		id: "evt_forged",
		workspaceId: workspaceA,
		aggregateType: "payment",
		aggregateId: paymentB,
		eventName: "payment.refunded",
		payload: {},
		...over,
	}) as never;

describe("a handler handed another workspace's record", () => {
	/**
	 * 🔴 The one that matters most. This handler resolves an email address and
	 * sends that person an order's line items and totals. Reaching across a
	 * workspace here means one business's order details arrive in another
	 * business's customer's inbox.
	 */
	it("never emails one workspace's order to another's customer", async () => {
		const send = vi.fn(async () => undefined);
		await customerNotificationHandler(send, () => {}).handle(
			forgedEvent({ eventName: "order.paid", aggregateId: orderB }),
		);
		expect(send).not.toHaveBeenCalled();
	});

	it("never emails a receipt for another workspace's payment", async () => {
		const send = vi.fn(async () => undefined);
		await customerNotificationHandler(send, () => {}).handle(
			forgedEvent({ eventName: "payment.recorded" }),
		);
		expect(send).not.toHaveBeenCalled();
	});

	/**
	 * ⚠️ The restock path reads a payment, takes its order, and puts stock back.
	 * Unscoped, workspace A's stock would move because of workspace B's refund.
	 */
	it("never restocks against another workspace's refund", async () => {
		const log = vi.fn();
		await refundRestockHandler(log).handle(forgedEvent());
		// Nothing found, nothing done, nothing logged as done.
		expect(log).not.toHaveBeenCalledWith("refund.restocked", expect.anything());
	});

	/**
	 * 🔴 The one that reaches OUTSIDE the system entirely.
	 *
	 * A supplier handoff raises a purchase order and sends it to a real supplier,
	 * who picks and packs real goods. Handed another workspace's order it would
	 * ask Liam's roastery to ship coffee for a sale that belongs to a different
	 * business — and unlike every other handler here, the mistake leaves the
	 * building before anybody can notice it.
	 */
	it("never asks a supplier to ship another workspace's order", async () => {
		const sql = testDbClient();
		const purchaseOrdersFor = async (workspaceId: string) => {
			const rows = await sql`
				select count(*)::int as n from purchase_orders where workspace_id = ${workspaceId}
			`;
			return (rows as unknown as Array<{ n: number }>)[0].n;
		};

		const forged = vi.fn();
		await supplierHandoffHandler(forged).handle(
			forgedEvent({
				eventName: "order.paid",
				aggregateId: orderB,
				payload: { orderId: orderB },
			}),
		);
		/**
		 * 🔴 Assert on the DATABASE, not on the log.
		 *
		 * A log assertion here passed with BOTH workspace filters removed: the
		 * purchase order was raised against the wrong business and nothing was
		 * written to the log to say so, because a supplier with no handoff method
		 * is skipped silently. The row is the harm, so the row is what to check.
		 */
		expect(await purchaseOrdersFor(workspaceA)).toBe(0);
		expect(forged).not.toHaveBeenCalled();

		/**
		 * 🔴 The positive control, and without it the assertion above is worthless.
		 *
		 * B's order has a line item, a catalog item, a supplier and a mapping, so a
		 * handler that did NOT check the workspace would find all of it and raise a
		 * purchase order. This proves it can: the same handler, the same record,
		 * the only difference being an event that names B honestly.
		 */
		const honest = vi.fn();
		await supplierHandoffHandler(honest).handle(
			forgedEvent({
				workspaceId: workspaceB,
				eventName: "order.paid",
				aggregateId: orderB,
				payload: { orderId: orderB },
			}),
		);
		expect(honest).toHaveBeenCalledWith(
			"supplier-handoff.skipped_sandbox",
			expect.objectContaining({ raised: 1 }),
		);
		expect(await purchaseOrdersFor(workspaceB)).toBe(1);
	});

	/**
	 * ⚠️ Money owed to a person. A commission settled against another workspace's
	 * order pays a partner for a sale they had nothing to do with, out of a
	 * business that never made it.
	 */
	it("never settles a commission on another workspace's order", async () => {
		const log = vi.fn();
		await referralSettlementHandler(log).handle(
			forgedEvent({ eventName: "order.paid", aggregateId: orderB }),
		);
		expect(log).not.toHaveBeenCalledWith("referral.settled", expect.anything());
		expect(log).not.toHaveBeenCalledWith(
			"referral.cancelled",
			expect.anything(),
		);
	});

	/**
	 * ⚠️ A stored card. Attaching one workspace's payment method to another's
	 * subscription means the wrong customer is charged, off-session, every month,
	 * with nobody present to notice.
	 */
	it("never stores a card against another workspace's subscription", async () => {
		const log = vi.fn();
		await subscriptionPaymentMethodHandler(log).handle(
			forgedEvent({
				eventName: "order.paid",
				aggregateId: orderB,
				payload: { orderId: orderB, paymentId: paymentB },
			}),
		);
		expect(log).not.toHaveBeenCalledWith(
			"subscription.payment_method_saved",
			expect.anything(),
		);
	});

	/**
	 * ⚠️ The bell. Telling workspace A's team about workspace B's sale leaks the
	 * customer's name and the order number to people with no relationship to
	 * either.
	 */
	it("never tells one workspace's team about another's order", async () => {
		const send = vi.fn(async () => undefined);
		await operatorNotificationHandler(send, () => {}).handle(
			forgedEvent({ eventName: "order.paid", aggregateId: orderB }),
		);
		expect(send).not.toHaveBeenCalled();
	});

	/**
	 * The negative control, and it is not optional. A handler that refuses
	 * everything would pass every test above while doing nothing useful at all —
	 * which is exactly the shape of the seven defects found this week.
	 */
	it("still acts when the event genuinely belongs to the workspace", async () => {
		const send = vi.fn(async (_input: { to: string }) => undefined);
		await customerNotificationHandler(send, () => {}).handle(
			forgedEvent({
				// Same record, but the event now honestly names B.
				workspaceId: workspaceB,
				eventName: "order.paid",
				aggregateId: orderB,
			}),
		);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({ to: "reese@gemsutopia.example" }),
		);
	});
});
