import { testDbClient } from "@quickengine/db/testing";
import {
	createInvoice,
	getInvoice,
	setInvoiceStatus,
} from "@quickengine/mod-invoicing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	getPayment,
	listPayments,
	recordPayment,
	refundPayment,
	setPaymentStatus,
} from "../src";

const ownerId = "payments-owner";
const workspaceId = "00000000-0000-4000-8000-000000000801";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000802";
const clientId = "00000000-0000-4000-8000-000000000803";

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

describe("Payments persistence", () => {
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
