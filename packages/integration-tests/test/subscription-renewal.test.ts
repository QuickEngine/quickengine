import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 🔴 The money path nobody has ever watched work.
 *
 * A subscription is the highest-value transaction in the product and the only
 * one that happens with NOBODY PRESENT — no browser, no customer, no operator.
 * Everything that makes an ordinary checkout self-correcting is absent: there is
 * no one to see an error, retry a payment, or notice that the coffee stopped
 * coming.
 *
 * It has also failed silently twice already, in ways that read perfectly:
 *
 * · The renewal engine ended at `createOrder` and never charged. Every
 *   subscription in existence renewed for FREE, and the cycle was marked
 *   `charged` while it happened.
 * · `subscriptions.customer_id` pointed at the wrong table, so every insert
 *   violated a foreign key and a best-effort `try/catch` swallowed it. The
 *   table had ZERO ROWS, which is how it was eventually noticed — not by
 *   anybody reading the code, all of which looked right.
 *
 * So these tests drive the real engine against a real database and assert on
 * rows, never on logs. A log is what the last two defects were silent in.
 */

const owner = "sub-owner";
const workspace = "00000000-0000-4000-8000-0000001c0001";
const customer = "00000000-0000-4000-8000-0000001c0002";
const catalogItem = "00000000-0000-4000-8000-0000001c0003";
const plan = "00000000-0000-4000-8000-0000001c0004";

/** Yesterday, so the subscription is already due the moment it exists. */
const overdue = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

async function seed(over: { saved?: boolean; connected?: boolean } = {}) {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${owner}, 'Owner', 'sub-owner@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type, environment)
		values (${workspace}, ${owner}, 'Caffeinate', 'ecommerce', 'live')
	`;
	await sql`
		insert into workspace_branding (workspace_id, portal_slug, display_name, sender_email, support_email)
		values (${workspace}, 'renewal-test', 'Caffeinate', 'hello@caffeinate.shop', 'hello@caffeinate.shop')
	`;
	// ⚠️ A sending address is required: the customer notice fails closed without
	// one, because a subscriber has no relationship with the platform.
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${customer}, ${workspace}, 'Asher', 'asher@example.com')
	`;
	// ⚠️ `status` matters: pricing refuses anything that is not `active`, with one
	// message for missing, archived, draft and wrong-workspace alike — so a
	// fixture that omits it fails as "not available" and looks like a broken test.
	await sql`
		insert into catalog_items (id, workspace_id, name, type, status, price_cents, currency)
		values (${catalogItem}, ${workspace}, 'Ethiopia Guji 1kg', 'physical', 'active', 6200, 'CAD')
	`;
	await sql`
		insert into subscription_plans (id, workspace_id, name, interval, price_cents)
		values (${plan}, ${workspace}, 'Monthly box', 'month', 6200)
	`;
	await sql`
		insert into subscription_plan_items (workspace_id, plan_id, catalog_item_id, quantity, position)
		values (${workspace}, ${plan}, ${catalogItem}, 1, 0)
	`;
	if (over.connected !== false) {
		await sql`
			insert into payment_accounts (workspace_id, provider, environment, external_account_id, status, is_default)
			values (${workspace}, 'stripe', 'live', 'acct_test123', 'active', true)
		`;
	}
	const [subscription] = (await sql`
		insert into subscriptions
			(workspace_id, customer_id, plan_id, environment, status, next_renewal_at, started_at,
			 provider_customer_id, provider_payment_method_id)
		values
			(${workspace}, ${customer}, ${plan}, 'live', 'active', ${overdue()}, ${overdue()},
			 ${over.saved === false ? null : "cus_test123"},
			 ${over.saved === false ? null : "pm_test123"})
		returning id
	`) as unknown as Array<{ id: string }>;
	return { sql, subscriptionId: subscription.id };
}

const charged = vi.fn(async () => ({ externalPaymentId: "pi_renewal_1" }));

vi.mock("@quickengine/mod-payments", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@quickengine/mod-payments")>();
	return {
		...actual,
		/**
		 * ⚠️ Only the PROVIDER is faked. `recordPendingCheckoutPayment`,
		 * `getPaymentAccount` and everything else stay real and hit the real
		 * database — the point of this test is the rows they write, and stubbing
		 * them would leave it asserting on its own mocks.
		 */
		getPaymentProvider: () => ({
			...actual.getPaymentProvider("stripe"),
			createCharge: charged,
		}),
	};
});

beforeEach(() => {
	charged.mockClear();
});

describe("a subscription renewal, with nobody present", () => {
	it("charges the saved card and records an order for the cycle", async () => {
		const { sql, subscriptionId } = await seed();
		const { renewDueSubscriptions } = await import(
			"@quickengine/event-dispatch"
		);

		const result = await renewDueSubscriptions();
		expect(result).toMatchObject({ claimed: 1, ordered: 1, failed: 0 });

		// 🔴 The money actually left. This is the assertion the original engine
		// would have failed while reporting success.
		expect(charged).toHaveBeenCalledTimes(1);
		expect(charged).toHaveBeenCalledWith(
			expect.objectContaining({
				amountCents: 6200,
				offSession: expect.anything(),
			}),
		);

		const [cycle] = (await sql`
			select status, order_id from subscription_cycles
			where subscription_id = ${subscriptionId} and status = 'charged' and order_id is not null
		`) as unknown as Array<{ status: string; order_id: string }>;
		expect(cycle?.status).toBe("charged");

		// The pending payment row is what lets the provider's webhook find this
		// order later. Without it the customer is charged for a draft for ever.
		const payments = (await sql`
			select external_payment_id, amount_cents from payments where order_id = ${cycle.order_id}
		`) as unknown as Array<{
			external_payment_id: string;
			amount_cents: number;
		}>;
		expect(payments).toHaveLength(1);
		expect(payments[0].external_payment_id).toBe("pi_renewal_1");
		expect(payments[0].amount_cents).toBe(6200);
	});

	/**
	 * 🔴 The reason renewal is safe to run every minute. Two schedulers, or one
	 * retried after a timeout, must not bill the same month twice.
	 */
	it("cannot bill the same period twice", async () => {
		const { sql, subscriptionId } = await seed();
		const { renewDueSubscriptions } = await import(
			"@quickengine/event-dispatch"
		);

		await renewDueSubscriptions();
		const again = await renewDueSubscriptions();

		expect(again.claimed).toBe(0);
		expect(charged).toHaveBeenCalledTimes(1);
		const cycles = (await sql`
			select count(*)::int as n from subscription_cycles where subscription_id = ${subscriptionId}
		`) as unknown as Array<{ n: number }>;
		expect(cycles[0].n).toBe(1);
	});

	/**
	 * ⚠️ A card that failed once is a customer who still wants the coffee.
	 * Cancelling on the first decline loses somebody who would have paid.
	 */
	it("goes past due rather than cancelling on one decline", async () => {
		const { sql, subscriptionId } = await seed();
		charged.mockRejectedValueOnce(new Error("card_declined"));
		const { renewDueSubscriptions } = await import(
			"@quickengine/event-dispatch"
		);

		const result = await renewDueSubscriptions();
		expect(result).toMatchObject({ claimed: 1, ordered: 0, failed: 1 });

		const [row] = (await sql`
			select status, failed_attempts, cancelled_at from subscriptions where id = ${subscriptionId}
		`) as unknown as Array<{
			status: string;
			failed_attempts: number;
			cancelled_at: Date | null;
		}>;
		expect(row.status).toBe("past_due");
		expect(row.failed_attempts).toBe(1);
		expect(row.cancelled_at).toBeNull();

		// The operator has to be able to see WHY, or a customer silently stops
		// receiving what they are paying for.
		const [cycle] = (await sql`
			select status, failure_reason from subscription_cycles where subscription_id = ${subscriptionId}
		`) as unknown as Array<{ status: string; failure_reason: string | null }>;
		expect(cycle.status).toBe("failed");
		expect(cycle.failure_reason).toContain("card_declined");
	});

	/**
	 * 🔴 The exact shape of the original defect: a subscription with no stored
	 * card. It must fail LOUDLY on the cycle, not renew for nothing.
	 */
	it("refuses to renew for free when no card was ever saved", async () => {
		const { sql, subscriptionId } = await seed({ saved: false });
		const { renewDueSubscriptions } = await import(
			"@quickengine/event-dispatch"
		);

		const result = await renewDueSubscriptions();
		expect(result).toMatchObject({ ordered: 0, failed: 1 });
		expect(charged).not.toHaveBeenCalled();

		const [cycle] = (await sql`
			select status, order_id, failure_reason from subscription_cycles
			where subscription_id = ${subscriptionId}
		`) as unknown as Array<{
			status: string;
			order_id: string | null;
			failure_reason: string | null;
		}>;
		expect(cycle.status).toBe("failed");
		// A sentence an operator reads, not an error code — this never crosses an
		// HTTP boundary and has no error map to translate it.
		expect(cycle.failure_reason).toMatch(/saved payment method/i);
	});
});
