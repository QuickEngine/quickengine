import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createInvoiceCommand,
	deleteInvoiceCommand,
	setInvoiceStatusCommand,
} from "./application";

const ownerId = "invoicing-owner";
const workspaceId = "00000000-0000-4000-8000-0000000010a1";

const context = (operation: string, key: string, fingerprint = "same") => ({
	abortSignal: new AbortController().signal,
	actor: { id: ownerId, type: "user" as const },
	deadlineAtMs: Date.now() + 10_000,
	fingerprint,
	idempotencyKey: key,
	operation,
	organizationId: null,
	requestId: crypto.randomUUID(),
	source: "api" as const,
	workspaceId,
});

const invoiceInput = (overrides: Record<string, unknown> = {}) => ({
	lineItems: [
		{ description: "Consulting", quantity: 1, unitPriceCents: 50_000 },
	],
	...overrides,
});

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Invoicing Owner', 'invoicing@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Invoicing Workspace', 'agency')
	`;
});

describe("Invoicing durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createInvoiceCommand(
			context("invoices.create", "inv-1"),
			invoiceInput(),
		);
		const replay = await createInvoiceCommand(
			context("invoices.create", "inv-1"),
			invoiceInput(),
		);
		expect(first).toMatchObject({
			kind: "success",
			source: "executed",
			status: 201,
		});
		expect(replay).toMatchObject({
			kind: "success",
			source: "replayed",
			status: 201,
		});

		const sql = testDbClient();
		const [counts] = await sql`
			select
				(select count(*)::int from invoices where workspace_id = ${workspaceId}) invoices,
				(select count(*)::int from invoice_line_items) lines,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			invoices: 1,
			lines: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("rejects a reused idempotency key with different input", async () => {
		await createInvoiceCommand(
			context("invoices.create", "inv-2"),
			invoiceInput(),
		);
		const conflict = await createInvoiceCommand(
			context("invoices.create", "inv-2", "different"),
			invoiceInput({ notes: "changed" }),
		);
		expect(conflict).toEqual({ kind: "conflict" });
	});

	it("honors the status machine and blocks deleting a non-draft invoice", async () => {
		const created = await createInvoiceCommand(
			context("invoices.create", "inv-3"),
			invoiceInput(),
		);
		const id =
			created.kind === "success" ? (created.result as { id: string }).id : "";

		const sent = await setInvoiceStatusCommand(
			context("invoices.set-status", "inv-3-sent"),
			id,
			"sent",
		);
		expect(sent).toMatchObject({ kind: "success", status: 200 });

		await expect(
			deleteInvoiceCommand(context("invoices.delete", "inv-3-del"), id),
		).rejects.toThrow(/draft/);
	});
});
