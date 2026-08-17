import { setWorkspaceEnvironment } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import {
	createInvoice,
	getInvoice,
	setInvoiceStatus,
} from "@quickengine/mod-invoicing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyCheckoutSettlement,
	getOrderPaymentSummary,
	getPayment,
	getPaymentAccount,
	listPayments,
	recordPayment,
	recordPendingCheckoutPayment,
	refundPayment,
	setDefaultPaymentProvider,
	setPaymentStatus,
	upsertPaymentAccount,
} from "../src";

const ownerId = "payments-owner";
const workspaceId = "00000000-0000-4000-8000-000000000801";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000802";
const clientId = "00000000-0000-4000-8000-000000000803";
const settlementOrderId = "00000000-0000-4000-8000-000000000804";
const disputeOrderId = "00000000-0000-4000-8000-000000000805";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'Payment Owner', 'payments@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Payments', 'agency'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'agency')`;
	await sql`insert into client_records (id, workspace_id, name, email, company) values (${clientId}, ${workspaceId}, 'Grace Client', 'grace@example.com', 'Compilers Inc')`;
});

async function issuedInvoice() {
	const invoice = await createInvoice(workspaceId, {
		clientId,
		currency: "USD",
		lineItems: [
			{ description: "Project", quantity: 1, unitPriceCents: 10_000 },
		],
	});
	await setInvoiceStatus(workspaceId, invoice.id, "sent");
	return invoice;
}

describe("Connected payment providers", () => {
	it("returns an order's settlement and complete refund history", async () => {
		const sql = testDbClient();
		await sql`
			insert into orders (
				id, workspace_id, client_id, client_name, sequence, number, status,
				currency, subtotal_cents, total_cents
			) values (
				${settlementOrderId}, ${workspaceId}, ${clientId}, 'Grace Client', 1,
				'ORD-0001', 'placed', 'CAD', 3600, 3600
			)
		`;
		const [payment] = await sql<{ id: string }[]>`
			insert into payments (
				workspace_id, order_id, client_id, amount_cents, currency, status,
				provider, environment, payment_method, reference, succeeded_at
			) values (
				${workspaceId}, ${settlementOrderId}, ${clientId}, 3600, 'CAD',
				'refunded', 'stripe', 'live', 'card', 'pi_order_summary', now()
			) returning id
		`;
		await sql`
			insert into payment_refunds (
				workspace_id, payment_id, amount_cents, provider, environment,
				external_refund_id, reason
			) values (
				${workspaceId}, ${payment.id}, 1200, 'stripe', 'live',
				're_order_summary', 'Customer request'
			)
		`;

		await expect(
			getOrderPaymentSummary(workspaceId, settlementOrderId),
		).resolves.toMatchObject({
			provider: "stripe",
			paymentMethod: "card",
			reference: "pi_order_summary",
			status: "refunded",
			refunds: [{ amountCents: 1200, reason: "Customer request" }],
		});
	});

	it("locks a workspace environment after a provider account exists", async () => {
		await expect(
			setWorkspaceEnvironment(workspaceId, "test"),
		).resolves.toMatchObject({
			environment: "test",
		});
		await upsertPaymentAccount(workspaceId, "stripe", {
			externalAccountId: "acct_test_lock",
		});
		await expect(setWorkspaceEnvironment(workspaceId, "live")).rejects.toThrow(
			"WORKSPACE_ENVIRONMENT_LOCKED",
		);
	});

	it("never resolves a test connected account from the live webhook channel", async () => {
		await setWorkspaceEnvironment(workspaceId, "test");
		await upsertPaymentAccount(workspaceId, "stripe", {
			externalAccountId: "acct_same_mode_boundary",
		});
		const event = {
			id: "evt_test_boundary",
			type: "payment_intent.succeeded",
			externalPaymentId: "pi_test_boundary",
			externalAccountId: "acct_same_mode_boundary",
			payload: {},
		};
		await expect(
			applyCheckoutSettlement(event, event.externalAccountId, "stripe", "live"),
		).resolves.toEqual({
			applied: false,
			reason: "unknown connected account",
			// A live endpoint receiving a test account's event is somebody else's
			// business, not a divergence — so it must NOT raise an alert.
			expected: true,
		});
	});

	/**
	 * 🔴 A refund the provider says happened, that we could not apply, must be
	 * ALARMING rather than silent.
	 *
	 * This is the shape of the defect that survived three PRs in Stripe and is
	 * predicted to exist in PayPal: `charge.refunded` arrives carrying no payment
	 * id, settlement discards it, and the webhook answers 200 — so the provider is
	 * satisfied, our totals are wrong, and nothing anywhere says so.
	 *
	 * ⚠️ This asserts OUR classification, not a provider payload. It deliberately
	 * does not invent a PayPal refund body: `TECH_DEBT.md` records that the Stripe
	 * equivalent passed against a hand-written event while remaining broken in
	 * production. The payload-shaped test is written from a captured sandbox
	 * refund, once credentials exist.
	 */
	it("flags a settlement event it could not apply, rather than dropping it quietly", async () => {
		const event = {
			id: "evt_refund_without_payment_id",
			type: "charge.refunded",
			externalPaymentId: null,
			externalAccountId: "acct_refund_alarm",
			payload: {},
		};
		await expect(
			applyCheckoutSettlement(event, event.externalAccountId, "stripe", "live"),
		).resolves.toEqual({
			applied: false,
			reason: "event carries no payment id",
			expected: false,
		});
	});
	/**
	 * 🔴 Settlement used to place the order and leave the payment in `pending`
	 * forever. Real money showed as pending in Payments, and because a refund
	 * requires `succeeded`, no completed checkout could ever be refunded. Found
	 * by the first real Caffeinate purchase on 2026-08-11.
	 */
	it("settles the payment itself, not only the order it belongs to", async () => {
		await upsertPaymentAccount(workspaceId, "stripe", {
			externalAccountId: "acct_settles_payment",
		});
		const sql = testDbClient();
		await sql`insert into orders (id, workspace_id, client_id, client_name, sequence, number, currency, subtotal_cents, total_cents, status) values (${settlementOrderId}, ${workspaceId}, ${clientId}, 'Grace Client', 1, 'ORD-0001', 'CAD', 2400, 3600, 'draft')`;
		await recordPendingCheckoutPayment({
			workspaceId,
			orderId: settlementOrderId,
			clientId,
			clientEmail: "grace@example.com",
			externalPaymentId: "pi_settles_payment",
			provider: "stripe",
			amountCents: 3600,
			currency: "CAD",
			environment: "live",
		});

		const event = {
			id: "evt_settles_payment",
			type: "payment_intent.succeeded",
			externalPaymentId: "pi_settles_payment",
			externalAccountId: "acct_settles_payment",
			payload: {},
		};
		await expect(
			applyCheckoutSettlement(event, event.externalAccountId, "stripe", "live"),
		).resolves.toMatchObject({ applied: true, status: "placed" });

		const settled = (await listPayments(workspaceId)).find(
			(row) => row.externalPaymentId === "pi_settles_payment",
		);
		expect(settled?.status).toBe("succeeded");
		expect(settled?.succeededAt).not.toBeNull();

		// Stripe retries on any non-2xx, so the same event arrives again. The order
		// is no longer `draft` and the payment is already `succeeded`; neither may
		// throw, or the provider would redeliver this settlement forever.
		await expect(
			applyCheckoutSettlement(event, event.externalAccountId, "stripe", "live"),
		).resolves.toMatchObject({ applied: false });
		expect(
			(await listPayments(workspaceId)).find(
				(row) => row.externalPaymentId === "pi_settles_payment",
			)?.status,
		).toBe("succeeded");
	});

	it("delegates a paid checkout to the cross-module transaction coordinator", async () => {
		await upsertPaymentAccount(workspaceId, "stripe", {
			externalAccountId: "acct_coordinated_payment",
		});
		const sql = testDbClient();
		await sql`insert into orders (id, workspace_id, client_id, client_name, sequence, number, currency, subtotal_cents, total_cents, status) values (${settlementOrderId}, ${workspaceId}, ${clientId}, 'Grace Client', 1, 'ORD-0001', 'CAD', 3600, 3600, 'draft')`;
		await recordPendingCheckoutPayment({
			workspaceId,
			orderId: settlementOrderId,
			clientId,
			clientEmail: "grace@example.com",
			externalPaymentId: "pi_coordinated_payment",
			provider: "stripe",
			amountCents: 3600,
			currency: "CAD",
			environment: "live",
		});
		const coordinator = vi.fn().mockResolvedValue({
			applied: true,
			orderId: settlementOrderId,
			workspaceId,
			status: "placed",
		});
		const event = {
			id: "evt_coordinated_payment",
			type: "payment_intent.succeeded",
			externalPaymentId: "pi_coordinated_payment",
			externalAccountId: "acct_coordinated_payment",
			payload: {},
		};

		await expect(
			applyCheckoutSettlement(
				event,
				event.externalAccountId,
				"stripe",
				"live",
				coordinator,
			),
		).resolves.toMatchObject({ applied: true });
		expect(coordinator).toHaveBeenCalledWith({
			eventId: event.id,
			orderId: settlementOrderId,
			paymentId: expect.any(String),
			provider: "stripe",
			workspaceId,
		});
		// The module does not perform a second, non-atomic fallback write.
		expect(
			(await listPayments(workspaceId)).find(
				(row) => row.externalPaymentId === "pi_coordinated_payment",
			)?.status,
		).toBe("pending");
	});

	/**
	 * 🔴 `charge.refunded` was a declared settlement event with no handler, so a
	 * refund taken at the provider was acknowledged and then dropped. That is the
	 * path the Payments module itself recommends, since it tells the operator to
	 * refund through Stripe. Found 2026-08-11 when a sandbox refund succeeded at
	 * Stripe and left no trace in QuickDash.
	 */
	it("records a refund announced by the provider", async () => {
		await upsertPaymentAccount(workspaceId, "stripe", {
			externalAccountId: "acct_refund_webhook",
		});
		const sql = testDbClient();
		await sql`insert into orders (id, workspace_id, client_id, client_name, sequence, number, currency, subtotal_cents, total_cents, status) values (${settlementOrderId}, ${workspaceId}, ${clientId}, 'Grace Client', 1, 'ORD-0001', 'CAD', 2400, 3600, 'draft')`;
		await recordPendingCheckoutPayment({
			workspaceId,
			orderId: settlementOrderId,
			clientId,
			clientEmail: "grace@example.com",
			externalPaymentId: "pi_refund_webhook",
			provider: "stripe",
			amountCents: 3600,
			currency: "CAD",
			environment: "live",
		});
		const paid = {
			id: "evt_refund_paid",
			type: "payment_intent.succeeded",
			externalPaymentId: "pi_refund_webhook",
			externalAccountId: "acct_refund_webhook",
			payload: {},
		};
		await applyCheckoutSettlement(
			paid,
			paid.externalAccountId,
			"stripe",
			"live",
		);

		// 🔴 Built deliberately, not spread from `paid`. The first version of this
		// test copied the succeeded event and only changed its type, so it carried a
		// `pi_` id that a real `charge.refunded` never has, and it passed against a
		// handler that could not fire in production. `verifyWebhook` is what turns
		// the charge into this intent id; see `providers/stripe.test.ts`.
		const refunded = {
			id: "evt_refunded",
			type: "charge.refunded",
			externalPaymentId: "pi_refund_webhook",
			externalAccountId: "acct_refund_webhook",
			payload: {},
		};
		await expect(
			applyCheckoutSettlement(
				refunded,
				refunded.externalAccountId,
				"stripe",
				"live",
			),
		).resolves.toMatchObject({ applied: false });

		const row = (await listPayments(workspaceId)).find(
			(p) => p.externalPaymentId === "pi_refund_webhook",
		);
		expect(row?.status).toBe("refunded");
		expect(row?.refundedAt).not.toBeNull();

		// A redelivery must not throw, or Stripe retries the refund forever.
		await expect(
			applyCheckoutSettlement(
				refunded,
				refunded.externalAccountId,
				"stripe",
				"live",
			),
		).resolves.toMatchObject({ applied: false });
	});

	/**
	 * 🔴 A dispute reached QuickDash NOWHERE before this. `charge.dispute.created`
	 * was not a settlement event, and the dispute object is a third shape whose
	 * own id (`dp_...`) matches no payment row — the same trap that left every
	 * refund invisible until 2026-08-11, one object type over.
	 *
	 * It is also the only provider event with a deadline attached: the money is
	 * already out of the business's balance and an unanswered dispute is lost by
	 * default. Silence here costs real money.
	 */
	it("records a dispute and announces it, keeping the payment refundable", async () => {
		await upsertPaymentAccount(workspaceId, "stripe", {
			externalAccountId: "acct_dispute_webhook",
		});
		const sql = testDbClient();
		await sql`insert into orders (id, workspace_id, client_id, client_name, sequence, number, currency, subtotal_cents, total_cents, status) values (${disputeOrderId}, ${workspaceId}, ${clientId}, 'Grace Client', 2, 'ORD-0002', 'CAD', 2400, 3600, 'draft')`;
		await recordPendingCheckoutPayment({
			workspaceId,
			orderId: disputeOrderId,
			clientId,
			clientEmail: "grace@example.com",
			externalPaymentId: "pi_dispute_webhook",
			provider: "stripe",
			amountCents: 3600,
			currency: "CAD",
			environment: "live",
		});
		const paid = {
			id: "evt_dispute_paid",
			type: "payment_intent.succeeded",
			externalPaymentId: "pi_dispute_webhook",
			externalAccountId: "acct_dispute_webhook",
			payload: {},
		};
		await applyCheckoutSettlement(
			paid,
			paid.externalAccountId,
			"stripe",
			"live",
		);

		// The intent id is what `verifyWebhook` extracts from the dispute object;
		// a `dp_...` would match nothing, which is the defect this guards.
		const disputed = {
			id: "evt_disputed",
			type: "charge.dispute.created",
			externalPaymentId: "pi_dispute_webhook",
			externalAccountId: "acct_dispute_webhook",
			payload: {},
		};
		await expect(
			applyCheckoutSettlement(
				disputed,
				disputed.externalAccountId,
				"stripe",
				"live",
			),
		).resolves.toMatchObject({ applied: false, expected: true });

		const row = (await listPayments(workspaceId)).find(
			(p) => p.externalPaymentId === "pi_dispute_webhook",
		);
		expect(row?.status).toBe("disputed");

		// 🔑 The outbox event is what makes the bell ring. Without it the status
		// changes in a table nobody is looking at.
		const events = await sql`
			select payload from api_outbox_events
			where workspace_id = ${workspaceId} and event_name = 'payment.status-changed'
		`;
		expect(
			events.some(
				(row: { payload: { status?: string } }) =>
					row.payload?.status === "disputed",
			),
		).toBe(true);

		// A redelivery must not throw, or Stripe retries forever.
		await expect(
			applyCheckoutSettlement(
				disputed,
				disputed.externalAccountId,
				"stripe",
				"live",
			),
		).resolves.toMatchObject({ applied: false });
	});

	it("keeps one account per provider and switches the default without deleting either", async () => {
		await upsertPaymentAccount(workspaceId, "stripe", {
			externalAccountId: "acct_stripe_1",
			chargesEnabled: true,
			payoutsEnabled: true,
		});
		await setDefaultPaymentProvider(workspaceId, "stripe");
		await upsertPaymentAccount(workspaceId, "paypal", {
			externalAccountId: "merchant:paypal_1",
			chargesEnabled: true,
			payoutsEnabled: true,
		});
		await setDefaultPaymentProvider(workspaceId, "paypal");

		expect(await getPaymentAccount(workspaceId)).toMatchObject({
			provider: "paypal",
			externalAccountId: "merchant:paypal_1",
			isDefault: true,
		});
		expect(await getPaymentAccount(workspaceId, "stripe")).toMatchObject({
			provider: "stripe",
			externalAccountId: "acct_stripe_1",
			isDefault: false,
		});
	});

	it("updates a provider connection instead of creating a duplicate", async () => {
		await upsertPaymentAccount(workspaceId, "stripe", {
			externalAccountId: "acct_old",
		});
		await upsertPaymentAccount(workspaceId, "stripe", {
			externalAccountId: "acct_new",
		});
		const sql = testDbClient();
		const rows = await sql`
			select external_account_id
			from payment_accounts
			where workspace_id = ${workspaceId} and provider = 'stripe'
		`;
		expect(rows).toEqual([{ external_account_id: "acct_new" }]);
	});
});

describe("Payments persistence", () => {
	it("allows the same provider id in isolated test and live workspaces", async () => {
		await setWorkspaceEnvironment(otherWorkspaceId, "test");
		const live = await recordPayment(workspaceId, {
			amountCents: 100,
			provider: "stripe",
			externalPaymentId: "pi_same_across_modes",
		});
		const test = await recordPayment(otherWorkspaceId, {
			amountCents: 100,
			provider: "stripe",
			externalPaymentId: "pi_same_across_modes",
		});
		expect(live.environment).toBe("live");
		expect(test.environment).toBe("test");
	});
	it("snapshots identity and keeps a partial invoice outstanding", async () => {
		const invoice = await issuedInvoice();
		const payment = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 4_000,
			provider: "manual",
			paymentMethod: "cash",
			status: "succeeded",
		});
		expect(payment).toMatchObject({
			clientName: "Grace Client",
			clientEmail: "grace@example.com",
			clientCompany: "Compilers Inc",
			currency: "USD",
		});
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("sent");
	});

	it("marks an invoice paid only after net successful payments cover it", async () => {
		const invoice = await issuedInvoice();
		await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 4_000,
			provider: "manual",
			status: "succeeded",
		});
		await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 6_000,
			provider: "manual",
			status: "succeeded",
		});
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("paid");
		await expect(
			recordPayment(workspaceId, {
				invoiceId: invoice.id,
				amountCents: 1,
				provider: "manual",
				status: "succeeded",
			}),
		).rejects.toThrow("PAYMENT_EXCEEDS_INVOICE_BALANCE");
	});

	it("records partial refunds and reopens an underpaid invoice", async () => {
		const invoice = await issuedInvoice();
		const payment = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 10_000,
			provider: "manual",
			status: "succeeded",
		});
		await refundPayment(workspaceId, payment.id, {
			amountCents: 2_500,
			reason: "Partial return",
		});
		const detail = await getPayment(workspaceId, payment.id);
		expect(detail?.status).toBe("succeeded");
		expect(detail?.refunds).toHaveLength(1);
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("sent");
		await expect(
			refundPayment(workspaceId, payment.id, { amountCents: 8_000 }),
		).rejects.toThrow("REFUND_EXCEEDS_PAYMENT");
	});

	it("requires workspace scope and rejects cross-workspace sources", async () => {
		const invoice = await issuedInvoice();
		await expect(
			recordPayment(otherWorkspaceId, {
				invoiceId: invoice.id,
				amountCents: 100,
				status: "succeeded",
			}),
		).rejects.toThrow("INVOICE_NOT_FOUND");
		const payment = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 100,
			provider: "manual",
			status: "succeeded",
		});
		expect(await getPayment(otherWorkspaceId, payment.id)).toBeUndefined();
		expect(await listPayments(otherWorkspaceId)).toEqual([]);
		await expect(
			refundPayment(otherWorkspaceId, payment.id, { amountCents: 50 }),
		).rejects.toThrow("PAYMENT_NOT_FOUND");
	});
});

/**
 * The path a provider webhook drives. Stripe reports `payment_intent.succeeded` and
 * a pending payment becomes succeeded — which previously ran no balance check at
 * all, so a retried or duplicated webhook could take an invoice past its total.
 */
describe("Settling a pending payment", () => {
	it("rejects money that would take the invoice past its total", async () => {
		const invoice = await issuedInvoice();
		await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 10_000,
			provider: "manual",
			status: "succeeded",
		});
		// A second payment, still pending, so nothing is over-collected yet.
		const pending = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 10_000,
			provider: "stripe",
			status: "pending",
		});

		await expect(
			setPaymentStatus(workspaceId, pending.id, "succeeded"),
		).rejects.toThrow("PAYMENT_EXCEEDS_INVOICE_BALANCE");

		// The invoice must be untouched: still paid by the first payment only.
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("paid");
		expect((await getPayment(workspaceId, pending.id))?.status).toBe("pending");
	});

	it("allows settlement that stays within the balance and settles the invoice", async () => {
		const invoice = await issuedInvoice();
		const pending = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 10_000,
			provider: "stripe",
			status: "pending",
		});
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("sent");

		await setPaymentStatus(workspaceId, pending.id, "succeeded");

		expect((await getPayment(workspaceId, pending.id))?.status).toBe(
			"succeeded",
		);
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("paid");
	});

	it("settles exactly to the total without tripping the guard", async () => {
		const invoice = await issuedInvoice();
		await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 6_000,
			provider: "manual",
			status: "succeeded",
		});
		const pending = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 4_000,
			provider: "stripe",
			status: "pending",
		});

		await setPaymentStatus(workspaceId, pending.id, "succeeded");
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("paid");
	});

	/**
	 * Reconciliation declines to settle a void invoice, so letting money land against
	 * one would strand a succeeded payment the invoice never accounts for.
	 */
	it("refuses to settle against a void invoice", async () => {
		const invoice = await issuedInvoice();
		const pending = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 5_000,
			provider: "stripe",
			status: "pending",
		});
		await setInvoiceStatus(workspaceId, invoice.id, "void");

		await expect(
			setPaymentStatus(workspaceId, pending.id, "succeeded"),
		).rejects.toThrow("INVOICE_NOT_PAYABLE");
	});

	it("does not settle a payment belonging to another workspace", async () => {
		const invoice = await issuedInvoice();
		const pending = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 5_000,
			provider: "stripe",
			status: "pending",
		});

		await expect(
			setPaymentStatus(otherWorkspaceId, pending.id, "succeeded"),
		).rejects.toThrow("PAYMENT_NOT_FOUND");
	});

	// A payment with no invoice has no balance to exceed; the guard must not
	// invent one and block standalone money.
	it("settles a payment that is not attached to an invoice", async () => {
		const pending = await recordPayment(workspaceId, {
			clientId,
			amountCents: 2_500,
			provider: "stripe",
			status: "pending",
		});

		await setPaymentStatus(workspaceId, pending.id, "succeeded");
		expect((await getPayment(workspaceId, pending.id))?.status).toBe(
			"succeeded",
		);
	});
});

/**
 * Stripe retries webhooks. A retry must not create a second payment, and must not
 * error — "we have seen this one" is a normal case, not a failure.
 */
describe("Duplicate provider deliveries", () => {
	it("replays the original payment for a repeated payment intent", async () => {
		const invoice = await issuedInvoice();
		const first = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 4_000,
			provider: "stripe",
			stripePaymentIntentId: "pi_repeat_1",
			status: "succeeded",
		});

		const second = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 4_000,
			provider: "stripe",
			stripePaymentIntentId: "pi_repeat_1",
			status: "succeeded",
		});

		expect(second.id).toBe(first.id);
		expect(await listPayments(workspaceId)).toHaveLength(1);
		// The invoice must reflect one payment, not two.
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("sent");
	});

	it("replays for a repeated external payment id", async () => {
		const first = await recordPayment(workspaceId, {
			clientId,
			amountCents: 2_000,
			provider: "stripe",
			externalPaymentId: "ch_repeat_1",
			status: "succeeded",
		});
		const second = await recordPayment(workspaceId, {
			clientId,
			amountCents: 2_000,
			provider: "stripe",
			externalPaymentId: "ch_repeat_1",
			status: "succeeded",
		});

		expect(second.id).toBe(first.id);
		expect(await listPayments(workspaceId)).toHaveLength(1);
	});

	/**
	 * A replay adds no money, so it must not be re-checked against the balance. A
	 * fully-paid invoice receiving a duplicate delivery of the payment that settled
	 * it would otherwise be rejected for overpaying itself.
	 */
	it("replays even once the invoice is fully paid", async () => {
		const invoice = await issuedInvoice();
		const first = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 10_000,
			provider: "stripe",
			stripePaymentIntentId: "pi_full_1",
			status: "succeeded",
		});
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("paid");

		const replay = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 10_000,
			provider: "stripe",
			stripePaymentIntentId: "pi_full_1",
			status: "succeeded",
		});
		expect(replay.id).toBe(first.id);
	});

	// The same intent id in a different workspace is a different payment.
	it("scopes the replay to the workspace", async () => {
		const a = await recordPayment(workspaceId, {
			clientId,
			amountCents: 1_000,
			provider: "stripe",
			stripePaymentIntentId: "pi_shared",
			status: "succeeded",
		});
		const b = await recordPayment(otherWorkspaceId, {
			amountCents: 1_000,
			provider: "stripe",
			stripePaymentIntentId: "pi_shared",
			status: "succeeded",
		});
		expect(b.id).not.toBe(a.id);
	});

	it("still creates separate payments for distinct intent ids", async () => {
		const invoice = await issuedInvoice();
		for (const id of ["pi_a", "pi_b"]) {
			await recordPayment(workspaceId, {
				invoiceId: invoice.id,
				amountCents: 3_000,
				provider: "stripe",
				stripePaymentIntentId: id,
				status: "succeeded",
			});
		}
		expect(await listPayments(workspaceId)).toHaveLength(2);
	});
});

/**
 * 🔴 A payment recorded against an order is the path a storefront running its
 * OWN payment provider takes — Gemsutopia with PayPal. The order is created via
 * checkout, the site takes the money, and this attaches the two.
 *
 * Without a tenancy check here, one workspace could attach its payments to
 * another workspace's orders, which is both a data leak and a way to mark
 * somebody else's order paid.
 */
describe("payments recorded against an order", () => {
	async function anOrder(inWorkspace: string) {
		const sql = testDbClient();
		const id = crypto.randomUUID();
		// Every NOT NULL column with no default, or the insert fails on a
		// constraint rather than testing what it means to test. client_name is
		// snapshotted on the order, which is how a guest purchase keeps a name.
		await sql`
			insert into orders (id, workspace_id, client_id, client_name, client_email, sequence, number, currency, subtotal_cents, tax_cents, total_cents, status)
			values (
				${id}, ${inWorkspace},
				${inWorkspace === workspaceId ? clientId : null},
				'Grace Client', 'grace@example.com',
				${Math.floor(Math.random() * 1_000_000)}, ${`ORD-${id.slice(0, 8)}`},
				'USD', 5000, 0, 5000, 'draft'
			)
		`;
		return id;
	}

	it("links the money to the goods", async () => {
		const orderId = await anOrder(workspaceId);
		const payment = await recordPayment(workspaceId, {
			orderId,
			amountCents: 5_000,
			currency: "USD",
			provider: "paypal",
			externalPaymentId: `pp_${crypto.randomUUID()}`,
			status: "succeeded",
		});
		expect(payment.orderId).toBe(orderId);
		// Inherited from the order, so a guest checkout still gets a receipt.
		expect(payment.clientId).toBe(clientId);
	});

	it("refuses an order belonging to another workspace", async () => {
		const foreign = await anOrder(otherWorkspaceId);
		await expect(
			recordPayment(workspaceId, {
				orderId: foreign,
				amountCents: 5_000,
				provider: "paypal",
				externalPaymentId: `pp_${crypto.randomUUID()}`,
			}),
			// The raw domain code. The friendly wording is applied by
			// recordPaymentCommand, which is a layer above this one.
		).rejects.toThrow("ORDER_NOT_FOUND");
	});

	it("refuses a currency that disagrees with the order", async () => {
		const orderId = await anOrder(workspaceId);
		await expect(
			recordPayment(workspaceId, {
				orderId,
				amountCents: 5_000,
				currency: "CAD",
				provider: "paypal",
				externalPaymentId: `pp_${crypto.randomUUID()}`,
			}),
		).rejects.toThrow();
	});

	it("still records a payment with no order at all", async () => {
		// Cash, an invoice payment, a manual entry — orderId is optional.
		const payment = await recordPayment(workspaceId, {
			clientId,
			amountCents: 1_200,
			provider: "manual",
			externalPaymentId: `cash_${crypto.randomUUID()}`,
		});
		expect(payment.orderId).toBeNull();
	});
});
