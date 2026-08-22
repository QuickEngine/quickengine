import { testDbClient } from "@quickengine/db/testing";
import {
	customerNotificationHandler,
	refundRestockHandler,
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

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified) values
			(${ownerA}, 'Owner A', 'iso-a@example.com', true),
			(${ownerB}, 'Owner B', 'iso-b@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type) values
			(${workspaceA}, ${ownerA}, 'Caffeinate', 'ecommerce'),
			(${workspaceB}, ${ownerB}, 'Gemsutopia', 'ecommerce')
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
		values (${paymentB}, ${workspaceB}, ${orderB}, ${clientB}, 'reese@gemsutopia.example', 'stripe', 'live', 'refunded', 9900, 'CAD')
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
