import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createInvoice,
	deleteInvoice,
	getInvoice,
	listInvoices,
	setInvoiceStatus,
	updateDraftInvoice,
} from "../src";

const ownerId = "invoicing-owner";
const workspaceId = "00000000-0000-4000-8000-000000000701";
const otherWorkspaceId = "00000000-0000-4000-8000-000000000702";
const clientId = "00000000-0000-4000-8000-000000000703";
const otherClientId = "00000000-0000-4000-8000-000000000704";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Invoice Owner', 'invoice@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'Invoice Workspace', 'agency'),
			(${otherWorkspaceId}, ${ownerId}, 'Other Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values
			(${clientId}, ${workspaceId}, 'Ada Client', 'ada@example.com', 'Analytical Engines'),
			(${otherClientId}, ${otherWorkspaceId}, 'Other Client', 'other@example.com', null)
	`;
});

const invoiceInput = () => ({
	clientId,
	currency: "usd",
	taxCents: 125,
	notes: "Thank you",
	dueAt: new Date("2026-08-15T23:59:59.999Z"),
	lineItems: [
		{ description: "Design work", quantity: 2, unitPriceCents: 5_000 },
	],
});

describe("Invoicing persistence", () => {
	it("allocates stable numbers, snapshots the client, and computes totals", async () => {
		const first = await createInvoice(workspaceId, invoiceInput());
		const second = await createInvoice(workspaceId, invoiceInput());
		expect(first).toMatchObject({
			number: "INV-0001",
			clientName: "Ada Client",
			clientEmail: "ada@example.com",
			clientCompany: "Analytical Engines",
			currency: "USD",
			subtotalCents: 10_000,
			taxCents: 125,
			totalCents: 10_125,
		});
		expect(second.number).toBe("INV-0002");
		expect((await listInvoices(workspaceId)).map((item) => item.id)).toEqual([
			second.id,
			first.id,
		]);
	});

	it("requires workspace scope for read, edit, status, and delete", async () => {
		const invoice = await createInvoice(workspaceId, invoiceInput());
		expect(await getInvoice(otherWorkspaceId, invoice.id)).toBeUndefined();
		await expect(
			updateDraftInvoice(otherWorkspaceId, invoice.id, invoiceInput()),
		).rejects.toThrow("INVOICE_NOT_FOUND");
		await expect(
			setInvoiceStatus(otherWorkspaceId, invoice.id, "sent"),
		).rejects.toThrow("INVOICE_NOT_FOUND");
		expect(await deleteInvoice(otherWorkspaceId, invoice.id)).toBeUndefined();
		expect(await getInvoice(workspaceId, invoice.id)).toBeDefined();
	});

	it("edits only drafts and preserves issued financial history", async () => {
		const invoice = await createInvoice(workspaceId, invoiceInput());
		const updated = await updateDraftInvoice(workspaceId, invoice.id, {
			...invoiceInput(),
			taxCents: 0,
			lineItems: [
				{ description: "Revised work", quantity: 3, unitPriceCents: 2_000 },
			],
		});
		expect(updated).toMatchObject({ subtotalCents: 6_000, totalCents: 6_000 });
		const issued = await setInvoiceStatus(workspaceId, invoice.id, "sent", {
			now: new Date("2026-07-15T12:00:00.000Z"),
		});
		expect(issued.issuedAt?.toISOString()).toBe("2026-07-15T12:00:00.000Z");
		await expect(
			updateDraftInvoice(workspaceId, invoice.id, invoiceInput()),
		).rejects.toThrow("INVOICE_NOT_EDITABLE");
		await expect(deleteInvoice(workspaceId, invoice.id)).rejects.toThrow(
			"INVOICE_NOT_DELETABLE",
		);
		expect(
			await setInvoiceStatus(workspaceId, invoice.id, "void"),
		).toMatchObject({
			status: "void",
		});
	});

	it("rejects cross-workspace clients and invalid money or line data", async () => {
		await expect(
			createInvoice(workspaceId, {
				...invoiceInput(),
				clientId: otherClientId,
			}),
		).rejects.toThrow("CLIENT_WORKSPACE_MISMATCH");
		await expect(
			createInvoice(workspaceId, {
				...invoiceInput(),
				lineItems: [{ description: "", quantity: 0, unitPriceCents: -1 }],
			}),
		).rejects.toThrow();
	});
});
