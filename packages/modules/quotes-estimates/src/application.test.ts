import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createQuoteEstimateCommand,
	sendQuoteEstimateCommand,
	updateDraftQuoteEstimateCommand,
} from "./application";

const ownerId = "quotes-owner";
const workspaceId = "00000000-0000-4000-8000-0000000008a1";
const clientId = "00000000-0000-4000-8000-0000000008c1";

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

const quoteInput = (overrides: Record<string, unknown> = {}) => ({
	clientId,
	title: "Website build",
	lines: [{ name: "Design", quantity: 1, unitPriceCents: 50_000 }],
	...overrides,
});

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'Quotes Owner', 'quotes@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'Quotes Workspace', 'agency')
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email)
		values (${clientId}, ${workspaceId}, 'Acme Co', 'acme@example.com')
	`;
});

describe("Quotes & Estimates durable commands", () => {
	it("commits domain state, replay result, audit, and outbox exactly once", async () => {
		const first = await createQuoteEstimateCommand(
			context("quotes.create", "quote-1"),
			quoteInput(),
		);
		const replay = await createQuoteEstimateCommand(
			context("quotes.create", "quote-1"),
			quoteInput(),
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
				(select count(*)::int from quote_estimates where workspace_id = ${workspaceId}) quotes,
				(select count(*)::int from quote_estimate_line_items) lines,
				(select count(*)::int from api_mutations where workspace_id = ${workspaceId}) mutations,
				(select count(*)::int from api_audit_events where workspace_id = ${workspaceId}) audits,
				(select count(*)::int from api_outbox_events where workspace_id = ${workspaceId}) outbox
		`;
		expect(counts).toMatchObject({
			quotes: 1,
			lines: 1,
			mutations: 1,
			audits: 1,
			outbox: 1,
		});
	});

	it("rejects a reused idempotency key with different input", async () => {
		await createQuoteEstimateCommand(
			context("quotes.create", "quote-2"),
			quoteInput(),
		);
		const conflict = await createQuoteEstimateCommand(
			context("quotes.create", "quote-2", "different"),
			quoteInput({ title: "Other" }),
		);
		expect(conflict).toEqual({ kind: "conflict" });
	});

	it("edits a draft then sends it, and blocks editing once sent", async () => {
		const created = await createQuoteEstimateCommand(
			context("quotes.create", "quote-3"),
			quoteInput(),
		);
		const id =
			created.kind === "success" ? (created.result as { id: string }).id : "";

		const updated = await updateDraftQuoteEstimateCommand(
			context("quotes.update", "quote-3-edit"),
			id,
			quoteInput({ title: "Website build v2" }),
		);
		expect(updated).toMatchObject({ kind: "success", status: 200 });

		const sent = await sendQuoteEstimateCommand(
			context("quotes.send", "quote-3-send"),
			id,
		);
		expect(sent).toMatchObject({ kind: "success", status: 200 });

		await expect(
			updateDraftQuoteEstimateCommand(
				context("quotes.update", "quote-3-edit-2"),
				id,
				quoteInput({ title: "Too late" }),
			),
		).rejects.toThrow(/draft/);
	});
});
