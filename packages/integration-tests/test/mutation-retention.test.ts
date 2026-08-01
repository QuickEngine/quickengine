import { pruneStoredResponses } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "mr-owner";
const workspaceId = "00000000-0000-4000-8000-000000e5a001";

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'MR Owner', 'mr@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values (${workspaceId}, ${ownerId}, 'MR Workspace', 'agency')
	`;
	await sql`
		insert into api_mutations
			(workspace_id, operation, idempotency_key, fingerprint, state, actor_type, actor_id, request_id, source, response_status, response_body, started_at, completed_at)
		values
			(${workspaceId}, 'invoices.create', 'mr-old', 'f1', 'completed', 'user', ${ownerId}, 'r1', 'api', 201,
			 ${sql.json({ clientName: "Ada Lovelace", totalCents: 15000 })}, ${ago(30)}, ${ago(30)}),
			(${workspaceId}, 'invoices.create', 'mr-new', 'f2', 'completed', 'user', ${ownerId}, 'r2', 'api', 201,
			 ${sql.json({ clientName: "Grace Hopper", totalCents: 22000 })}, ${ago(1)}, ${ago(1)})
	`;
});

describe("mutation retention", () => {
	/**
	 * 🔴 `response_body` holds the full response of every durable mutation so an
	 * idempotent retry returns the same answer — invoice contents, client details,
	 * order lines. Real customer records, kept forever, with no pruning job.
	 */
	it("clears customer content once it can no longer be replayed", async () => {
		const sql = testDbClient();

		const result = await pruneStoredResponses();
		expect(result.responsesCleared).toBe(1);

		const [old] = await sql`
			select response_body from api_mutations where idempotency_key = 'mr-old'`;
		expect(old?.response_body).toBeNull();
	});

	// A retry within the window must still replay, or this trades one bug for a
	// double-charge.
	it("leaves a response that is still replayable", async () => {
		const sql = testDbClient();
		await pruneStoredResponses();

		const [recent] = await sql`
			select response_body from api_mutations where idempotency_key = 'mr-new'`;
		expect(recent?.response_body).not.toBeNull();
	});

	// The row is the evidence a write happened and who made it. Only the content
	// goes.
	it("keeps the mutation ledger itself", async () => {
		const sql = testDbClient();
		await pruneStoredResponses();

		const rows = await sql`
			select idempotency_key, response_status from api_mutations
			where workspace_id = ${workspaceId} order by idempotency_key`;
		expect(rows).toHaveLength(2);
		expect(rows[0]?.response_status).toBe(201);
	});

	it("is safe to run twice", async () => {
		await pruneStoredResponses();
		const second = await pruneStoredResponses();
		expect(second.responsesCleared).toBe(0);
	});
});
