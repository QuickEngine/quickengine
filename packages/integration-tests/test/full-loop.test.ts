import { testDbClient } from "@quickengine/db/testing";
import { createFulfillment } from "@quickengine/mod-fulfillment";
import { getInvoice, setInvoiceStatus } from "@quickengine/mod-invoicing";
import { recordPayment } from "@quickengine/mod-payments";
import {
	acceptQuoteEstimate,
	convertQuoteEstimateToInvoice,
	createQuoteEstimate,
	sendQuoteEstimate,
} from "@quickengine/mod-quotes-estimates";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "loop-owner";
const workspaceId = "00000000-0000-4000-8000-0000000f0001";
const clientId = "00000000-0000-4000-8000-0000000f0002";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Loop Owner', 'loop@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Loop Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values (${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com', 'Analytical Engines')
	`;
	// convertQuoteEstimateToInvoice requires the invoicing module enabled.
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values (${workspaceId}, 'invoicing', true)
	`;
});

async function acceptedQuote() {
	const quote = await createQuoteEstimate(workspaceId, {
		clientId,
		kind: "quote",
		title: "Website redesign",
		lines: [{ name: "Implementation", quantity: 2, unitPriceCents: 8_000 }],
	});
	await sendQuoteEstimate(workspaceId, quote.id, { today: "2026-07-14" });
	await acceptQuoteEstimate(
		workspaceId,
		quote.id,
		{ acceptedByName: "Ada Lovelace" },
		{ today: "2026-07-14" },
	);
	return quote;
}

describe("Full business loop: quote → invoice → payment → fulfillment", () => {
	it("drives the whole chain and reconciles state at every handoff", async () => {
		// Accepted quote converts to a draft invoice for the right total.
		const quote = await acceptedQuote();
		const invoice = await convertQuoteEstimateToInvoice(workspaceId, quote.id);
		expect(invoice).toMatchObject({
			status: "draft",
			totalCents: 16_000,
			clientName: "Ada Lovelace",
		});

		// Fulfillment must NOT be creatable from an unpaid invoice.
		await expect(
			createFulfillment(workspaceId, {
				title: "Deliver",
				invoiceId: invoice.id,
				sourceModule: "invoicing",
				sourceRecordId: invoice.id,
			}),
		).rejects.toThrow("INVOICE_NOT_PAID");

		// Issue the invoice, then pay it in full.
		await setInvoiceStatus(workspaceId, invoice.id, "sent");
		const payment = await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 16_000,
			status: "succeeded",
		});
		expect(payment.status).toBe("succeeded");

		// The payment reconciled the invoice to paid.
		const paidInvoice = await getInvoice(workspaceId, invoice.id);
		expect(paidInvoice?.status).toBe("paid");
		expect(paidInvoice?.paidAt).not.toBeNull();

		// Now fulfillment can be created from the paid invoice + succeeded payment.
		const fulfillment = await createFulfillment(workspaceId, {
			title: "Deliver the redesign",
			invoiceId: invoice.id,
			paymentId: payment.id,
			sourceModule: "invoicing",
			sourceRecordId: invoice.id,
		});
		expect(fulfillment).toMatchObject({
			status: "pending",
			invoiceId: invoice.id,
			clientName: "Ada Lovelace",
			invoiceNumber: invoice.number,
		});

		// Exactly-once: a second fulfillment from the same source is rejected.
		await expect(
			createFulfillment(workspaceId, {
				title: "Duplicate",
				invoiceId: invoice.id,
				sourceModule: "invoicing",
				sourceRecordId: invoice.id,
			}),
		).rejects.toThrow("FULFILLMENT_SOURCE_EXISTS");
	});

	it("keeps a partially paid invoice unpaid until a top-up settles it", async () => {
		const quote = await acceptedQuote();
		const invoice = await convertQuoteEstimateToInvoice(workspaceId, quote.id);
		await setInvoiceStatus(workspaceId, invoice.id, "sent");

		await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 6_000,
			status: "succeeded",
		});
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("sent");

		await recordPayment(workspaceId, {
			invoiceId: invoice.id,
			amountCents: 10_000,
			status: "succeeded",
		});
		expect((await getInvoice(workspaceId, invoice.id))?.status).toBe("paid");
	});
});
