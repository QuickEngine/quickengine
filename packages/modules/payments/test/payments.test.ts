import { testDbClient } from "@quickengine/db/testing";
import {
	createInvoice,
	getInvoice,
	setInvoiceStatus,
} from "@quickengine/mod-invoicing";
import { beforeEach, describe, expect, it } from "vitest";
import { getPayment, listPayments, recordPayment, refundPayment } from "../src";

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
