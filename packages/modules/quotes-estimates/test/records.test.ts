import type { MutationResult } from "@quickengine/api-contracts";
import {
	db,
	eq,
	invoiceLineItems,
	orderLineItems,
	quoteEstimates,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	acceptQuoteEstimateCommand,
	convertQuoteEstimateToInvoiceCommand,
	convertQuoteEstimateToOrderCommand,
	createQuoteEstimateCommand,
	getQuoteEstimate,
	reviseQuoteEstimateInTx,
	sendQuoteEstimateCommand,
} from "../src";

const ownerId = "quotes-owner";
const otherOwnerId = "quotes-other-owner";
const workspaceId = "00000000-0000-4000-8000-000000000201";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000202";
const clientId = "00000000-0000-4000-8000-000000000203";
const otherClientId = "00000000-0000-4000-8000-000000000204";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values
			(${ownerId}, 'Quotes Owner', 'quotes@example.com', true),
			(${otherOwnerId}, 'Other Owner', 'quotes-other@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'Quotes Workspace', 'agency'),
			(${otherWorkspaceId}, ${otherOwnerId}, 'Other Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values
			(${clientId}, ${workspaceId}, 'Ada Lovelace', 'ada@example.com', 'Analytical Engines'),
			(${otherClientId}, ${otherWorkspaceId}, 'Grace Hopper', 'grace@example.com', 'Compilers Inc')
	`;
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values
			(${workspaceId}, 'invoicing', true),
			(${workspaceId}, 'orders', true)
	`;
});

/** Writes go through durable commands, which need an execution context. */
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

type QuoteRow = { id: string } & Record<string, unknown>;

function quoteInput(overrides: Record<string, unknown> = {}) {
	return {
		clientId,
		kind: "quote" as const,
		title: "Website redesign",
		lines: [
			{
				name: "Implementation",
				quantity: 2,
				unitLabel: "hours",
				unitPriceCents: 8_000,
			},
		],
		...overrides,
	};
}

// Idempotency keys are unique per call, so a helper used twice in one test still
// executes twice instead of replaying the first result.
let keySeq = 0;
const nextKey = (name: string) => `${name}-${++keySeq}`;

async function acceptedQuote(overrides: Record<string, unknown> = {}) {
	const created = committed(
		await createQuoteEstimateCommand(
			context("quotes.create", nextKey("create")),
			quoteInput(overrides),
		),
	) as QuoteRow;
	await sendQuoteEstimateCommand(
		context("quotes.send", nextKey("send")),
		created.id,
	);
	await acceptQuoteEstimateCommand(
		context("quotes.accept", nextKey("accept")),
		created.id,
		{ acceptedByName: "Ada Lovelace", acceptedByEmail: "ada@example.com" },
	);
	return created;
}

describe("Quotes & Estimates persistence", () => {
	it("keeps tenant boundaries and immutable revision history", async () => {
		await expect(
			createQuoteEstimateCommand(
				context("quotes.create", nextKey("cross-tenant")),
				quoteInput({ clientId: otherClientId }),
			),
		).rejects.toThrow("another workspace");

		const original = await acceptedQuote();
		expect(original).toMatchObject({
			number: "QTE-0001",
			clientName: "Ada Lovelace",
			status: "draft",
		});
		expect(
			await getQuoteEstimate(otherWorkspaceId, original.id),
		).toBeUndefined();

		// Revision has no durable command yet: it stays a UI-only lifecycle operation.
		// Through a transaction, which is how production reaches it. The convenience
		// wrapper that opened its own was deleted: it bypassed the unit of work, so
		// anything calling it mutated a quote with no idempotency, audit or outbox.
		const revision = await db.transaction((tx) =>
			reviseQuoteEstimateInTx(tx, workspaceId, original.id),
		);
		expect(revision).toMatchObject({
			number: "QTE-0001-R2",
			revision: 2,
			status: "draft",
			supersedesId: original.id,
		});
		await sendQuoteEstimateCommand(
			context("quotes.send", nextKey("send-revision")),
			revision.id,
		);
		const [superseded] = await db
			.select()
			.from(quoteEstimates)
			.where(eq(quoteEstimates.id, original.id));
		expect(superseded.status).toBe("superseded");
	});

	it("refuses to send a quote that is already past its valid-until date", async () => {
		const created = committed(
			await createQuoteEstimateCommand(
				context("quotes.create", nextKey("expired")),
				quoteInput({ validUntil: "2020-01-01" }),
			),
		) as QuoteRow;
		await expect(
			sendQuoteEstimateCommand(
				context("quotes.send", nextKey("send-expired")),
				created.id,
			),
		).rejects.toThrow("valid-until");
	});

	it("converts an accepted fractional quote to one invoice exactly once", async () => {
		const quote = await acceptedQuote({
			taxCents: 500,
			lines: [
				{
					name: "Consulting",
					quantity: "1.25",
					unitLabel: "hours",
					unitPriceCents: 8_000,
				},
			],
		});
		const invoice = committed(
			await convertQuoteEstimateToInvoiceCommand(
				context("quotes.convert.invoice", nextKey("to-invoice")),
				quote.id,
			),
		) as QuoteRow;
		// A second conversion returns the same invoice rather than minting another.
		const retry = committed(
			await convertQuoteEstimateToInvoiceCommand(
				context("quotes.convert.invoice", nextKey("to-invoice-retry")),
				quote.id,
			),
		) as QuoteRow;
		expect(retry.id).toBe(invoice.id);
		expect(invoice).toMatchObject({
			number: "INV-0001",
			subtotalCents: 10_000,
			taxCents: 500,
			totalCents: 10_500,
		});
		const [line] = await db
			.select()
			.from(invoiceLineItems)
			.where(eq(invoiceLineItems.invoiceId, invoice.id));
		expect(line).toMatchObject({
			quantity: 1,
			unitPriceCents: 10_000,
			sourceModule: "quotes-estimates",
		});
		expect(line.description).toContain("1.25 hours");
	});

	it("converts whole quantities to one order exactly once", async () => {
		const quote = await acceptedQuote();
		const order = committed(
			await convertQuoteEstimateToOrderCommand(
				context("quotes.convert.order", nextKey("to-order")),
				quote.id,
			),
		) as QuoteRow;
		const retry = committed(
			await convertQuoteEstimateToOrderCommand(
				context("quotes.convert.order", nextKey("to-order-retry")),
				quote.id,
			),
		) as QuoteRow;
		expect(retry.id).toBe(order.id);
		expect(order).toMatchObject({
			number: "ORD-0001",
			clientName: "Ada Lovelace",
			totalCents: 16_000,
		});
		const [line] = await db
			.select()
			.from(orderLineItems)
			.where(eq(orderLineItems.orderId, order.id));
		expect(line).toMatchObject({
			name: "Implementation",
			quantity: 2,
			lineTotalCents: 16_000,
		});
	});
});
