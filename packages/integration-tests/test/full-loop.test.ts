import type { MutationResult } from "@quickengine/api-contracts";
import { testDbClient } from "@quickengine/db/testing";
import { createFulfillment } from "@quickengine/mod-fulfillment";
import { getInvoice, setInvoiceStatus } from "@quickengine/mod-invoicing";
import { recordPayment } from "@quickengine/mod-payments";
import {
	acceptQuoteEstimateCommand,
	convertQuoteEstimateToInvoiceCommand,
	createQuoteEstimateCommand,
	sendQuoteEstimateCommand,
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
	// Converting to an invoice requires the invoicing module enabled.
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values (${workspaceId}, 'invoicing', true)
	`;
});

/** Quote writes go through durable commands, which need an execution context. */
const context = (operation: string, key: string) => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint: key,
	idempotencyKey: key,
	operation,
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

/** Unwraps a command outcome, failing loudly rather than returning undefined. */
function committed<T>(outcome: MutationResult<T>): T {
	if (outcome.kind !== "success") {
		throw new Error(`expected a committed mutation, got ${outcome.kind}`);
	}
	return outcome.result;
}

// Both tests build their own quote, so keys must differ or the second replays the first.
let keySeq = 0;
const nextKey = (name: string) => `${name}-${++keySeq}`;

async function acceptedQuote() {
	const quote = committed(
		await createQuoteEstimateCommand(
			context("quotes.create", nextKey("create")),
			{
				clientId,
				kind: "quote",
				title: "Website redesign",
				lines: [{ name: "Implementation", quantity: 2, unitPriceCents: 8_000 }],
			},
		),
	) as { id: string };
	await sendQuoteEstimateCommand(
		context("quotes.send", nextKey("send")),
		quote.id,
	);
	await acceptQuoteEstimateCommand(
		context("quotes.accept", nextKey("accept")),
		quote.id,
		{ acceptedByName: "Ada Lovelace" },
	);
	return quote;
}

describe("Full business loop: quote → invoice → payment → fulfillment", () => {
	it("drives the whole chain and reconciles state at every handoff", async () => {
		// Accepted quote converts to a draft invoice for the right total.
		const quote = await acceptedQuote();
		const invoice = committed(
			await convertQuoteEstimateToInvoiceCommand(
				context("quotes.convert.invoice", nextKey("to-invoice")),
				quote.id,
			),
		) as { id: string; number: string };
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
		const invoice = committed(
			await convertQuoteEstimateToInvoiceCommand(
				context("quotes.convert.invoice", nextKey("to-invoice")),
				quote.id,
			),
		) as { id: string; number: string };
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
