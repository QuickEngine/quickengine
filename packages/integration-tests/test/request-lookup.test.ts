import { getRequestTrace } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "rl-owner";
const workspaceId = "00000000-0000-4000-8000-0000000c0001";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000c0002";
const requestId = "req-shared-by-both-workspaces";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'RL Owner', 'rl@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'Mine', 'agency'),
			(${otherWorkspaceId}, ${ownerId}, 'Theirs', 'agency')
	`;
	// Same request id in two workspaces. Contrived, but it is the only way to
	// prove the scoping rather than assume it.
	await sql`
		insert into api_mutations
			(workspace_id, operation, idempotency_key, fingerprint, state, actor_type, actor_id, request_id, source, response_status, completed_at)
		values
			(${workspaceId}, 'invoices.create', 'k1', 'f1', 'completed', 'user', ${ownerId}, ${requestId}, 'api', 201, now()),
			(${otherWorkspaceId}, 'invoices.create', 'k2', 'f2', 'completed', 'user', ${ownerId}, ${requestId}, 'api', 201, now())
	`;
	await sql`
		insert into api_audit_events
			(workspace_id, actor_type, actor_id, action, resource_type, resource_id, request_id, source)
		values
			(${workspaceId}, 'user', ${ownerId}, 'invoice.created', 'invoice', 'inv-1', ${requestId}, 'api'),
			(${otherWorkspaceId}, 'user', ${ownerId}, 'invoice.created', 'invoice', 'inv-2', ${requestId}, 'api')
	`;
});

describe("request lookup", () => {
	it("returns the mutations and audit events for a request", async () => {
		const trace = await getRequestTrace(workspaceId, requestId);

		expect(trace.requestId).toBe(requestId);
		expect(trace.mutations).toHaveLength(1);
		expect(trace.mutations[0]?.operation).toBe("invoices.create");
		expect(trace.mutations[0]?.responseStatus).toBe(201);
		// Timing is the point of a diagnostics lookup.
		expect(trace.mutations[0]?.durationMs).toBeGreaterThanOrEqual(0);
		expect(trace.auditEvents).toHaveLength(1);
		expect(trace.auditEvents[0]?.resourceId).toBe("inv-1");
	});

	// 🔴 The guarantee. A request id is a UUID from somebody else's traffic just as
	// easily as your own, and this endpoint reads audit rows.
	it("never returns another workspace's records for the same request id", async () => {
		const mine = await getRequestTrace(workspaceId, requestId);
		const theirs = await getRequestTrace(otherWorkspaceId, requestId);

		expect(mine.auditEvents[0]?.resourceId).toBe("inv-1");
		expect(theirs.auditEvents[0]?.resourceId).toBe("inv-2");
		expect(mine.mutations).toHaveLength(1);
		expect(theirs.mutations).toHaveLength(1);
	});

	it("returns empty rather than failing for an unknown request id", async () => {
		const trace = await getRequestTrace(workspaceId, "no-such-request");

		expect(trace.mutations).toEqual([]);
		expect(trace.auditEvents).toEqual([]);
	});

	// Response bodies hold replayed customer records. A diagnostics surface that
	// re-serves them is a data-exposure path nobody audited.
	it("never exposes a stored response body", async () => {
		const trace = await getRequestTrace(workspaceId, requestId);

		expect(trace.mutations[0]).not.toHaveProperty("responseBody");
	});
});
