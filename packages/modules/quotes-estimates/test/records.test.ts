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
	acceptQuoteEstimate,
	convertQuoteEstimateToInvoice,
	convertQuoteEstimateToOrder,
	createQuoteEstimate,
	getQuoteEstimate,
	reviseQuoteEstimate,
	sendQuoteEstimate,
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

function quoteInput(
	overrides: Partial<Parameters<typeof createQuoteEstimate>[1]> = {},
): Parameters<typeof createQuoteEstimate>[1] {
	return {
		clientId,
		kind: "quote",
		title: "Website redesign",
		validUntil: "2026-08-31",
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

async function acceptedQuote(
	overrides: Partial<Parameters<typeof createQuoteEstimate>[1]> = {},
) {
	const created = await createQuoteEstimate(workspaceId, quoteInput(overrides));
	await sendQuoteEstimate(workspaceId, created.id, {
		today: "2026-07-14",
	});
	await acceptQuoteEstimate(
		workspaceId,
		created.id,
		{ acceptedByName: "Ada Lovelace", acceptedByEmail: "ada@example.com" },
		{ today: "2026-07-14" },
	);
	return created;
}

describe("Quotes & Estimates persistence", () => {
	it("keeps tenant boundaries and immutable revision history", async () => {
		await expect(
			createQuoteEstimate(workspaceId, quoteInput({ clientId: otherClientId })),
		).rejects.toThrow("CLIENT_WORKSPACE_MISMATCH");

		const original = await acceptedQuote();
		expect(original).toMatchObject({
			number: "QTE-0001",
			clientName: "Ada Lovelace",
			status: "draft",
		});
		expect(
			await getQuoteEstimate(otherWorkspaceId, original.id),
		).toBeUndefined();

		const revision = await reviseQuoteEstimate(workspaceId, original.id);
		expect(revision).toMatchObject({
			number: "QTE-0001-R2",
			revision: 2,
			status: "draft",
			supersedesId: original.id,
		});
		await sendQuoteEstimate(workspaceId, revision.id, {
			today: "2026-07-14",
		});
		const [superseded] = await db
			.select()
			.from(quoteEstimates)
			.where(eq(quoteEstimates.id, original.id));
		expect(superseded.status).toBe("superseded");
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
		const invoice = await convertQuoteEstimateToInvoice(workspaceId, quote.id);
		const retry = await convertQuoteEstimateToInvoice(workspaceId, quote.id);
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
		const order = await convertQuoteEstimateToOrder(workspaceId, quote.id);
		const retry = await convertQuoteEstimateToOrder(workspaceId, quote.id);
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
