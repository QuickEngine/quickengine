import { getSupportBundle } from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "sb-owner";
const workspaceId = "00000000-0000-4000-8000-0000000e1001";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000e1002";
const clientId = "00000000-0000-4000-8000-0000000e1003";

/** Strings that must never survive into a bundle, whatever shape it takes. */
const SECRETS = {
	keyHash: "hashed-secret-value-must-never-appear",
	webhookSecret: "webhook-ciphertext-must-never-appear",
	customerName: "Ada Lovelace",
	customerEmail: "ada@example.com",
	responseBody: "invoice-contents-must-never-appear",
};

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'SB Owner', 'sb@example.com', true)
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, name, business_type)
		values
			(${workspaceId}, ${ownerId}, 'SB Workspace', 'commerce'),
			(${otherWorkspaceId}, ${ownerId}, 'Not mine', 'commerce')
	`;
	await sql`
		insert into workspace_modules (workspace_id, module_id, enabled)
		values (${workspaceId}, 'invoicing', true), (${workspaceId}, 'orders', false)
	`;
	await sql`
		insert into client_records (id, workspace_id, name, email, company)
		values (${clientId}, ${workspaceId}, ${SECRETS.customerName}, ${SECRETS.customerEmail}, 'Analytical Engines')
	`;
	await sql`
		insert into quickengine_api_keys
			(workspace_id, created_by_user_id, name, type, prefix, key_hash, capabilities)
		values (${workspaceId}, ${ownerId}, 'CI key', 'secret', 'qe_live_abc', ${SECRETS.keyHash}, ${sql.json(["invoicing:read"])})
	`;
	await sql`
		insert into webhook_endpoints
			(id, workspace_id, url, secret_ciphertext, event_types, enabled)
		values ('00000000-0000-4000-8000-0000000e1010', ${workspaceId}, 'https://example.com/hook', ${SECRETS.webhookSecret}, ${sql.json(["invoice.created"])}, true)
	`;
	await sql`
		insert into webhook_deliveries
			(workspace_id, endpoint_id, event_id, event_name, payload, status)
		values
			(${workspaceId}, '00000000-0000-4000-8000-0000000e1010', '00000000-0000-4000-8000-0000000e1020', 'invoice.created', ${sql.json({ client: SECRETS.customerName })}, 'succeeded'),
			(${workspaceId}, '00000000-0000-4000-8000-0000000e1010', '00000000-0000-4000-8000-0000000e1021', 'invoice.created', ${sql.json({ client: SECRETS.customerName })}, 'exhausted')
	`;
	await sql`
		insert into api_mutations
			(workspace_id, operation, idempotency_key, fingerprint, state, actor_type, actor_id, request_id, source, response_status, response_body, completed_at)
		values (${workspaceId}, 'invoices.create', 'sb-k1', 'sb-f1', 'completed', 'user', ${ownerId}, 'sb-req-1', 'api', 201, ${sql.json({ leaked: SECRETS.responseBody })}, now())
	`;
});

describe("support bundle", () => {
	it("carries what support actually needs", async () => {
		const bundle = await getSupportBundle(workspaceId);

		expect(bundle?.workspace.name).toBe("SB Workspace");
		expect(bundle?.workspace.archived).toBe(false);
		expect(bundle?.modules).toHaveLength(2);
		expect(bundle?.credentials[0]?.prefix).toBe("qe_live_abc");
		expect(bundle?.credentials[0]?.capabilities).toEqual(["invoicing:read"]);
		expect(bundle?.webhooks.endpoints[0]?.url).toBe("https://example.com/hook");
		expect(bundle?.recentOperations[0]?.operation).toBe("invoices.create");
		expect(bundle?.recentOperations[0]?.requestId).toBe("sb-req-1");
	});

	// Counts are the diagnostic fact. The payloads behind them are the customer's
	// business data and are not.
	it("summarises deliveries as counts, not payloads", async () => {
		const bundle = await getSupportBundle(workspaceId);

		const byStatus = Object.fromEntries(
			(bundle?.webhooks.deliveries ?? []).map((row) => [row.status, row.count]),
		);
		expect(byStatus).toEqual({ succeeded: 1, exhausted: 1 });
	});

	/**
	 * 🔴 The test that matters.
	 *
	 * Serialises the whole bundle and searches it for every secret and every piece
	 * of customer data planted above. This deliberately does NOT assert on named
	 * fields — a field-by-field check only proves the fields somebody remembered,
	 * and the failure mode being guarded against is the one nobody remembered.
	 */
	it("leaks no secret and no customer data, anywhere in the payload", async () => {
		const bundle = await getSupportBundle(workspaceId);
		const serialised = JSON.stringify(bundle);

		for (const [label, secret] of Object.entries(SECRETS)) {
			expect(
				serialised,
				`${label} leaked into the support bundle`,
			).not.toContain(secret);
		}
	});

	it("never reaches into another workspace", async () => {
		const bundle = await getSupportBundle(otherWorkspaceId);

		expect(bundle?.workspace.name).toBe("Not mine");
		expect(bundle?.credentials).toEqual([]);
		expect(bundle?.webhooks.endpoints).toEqual([]);
		expect(bundle?.recentOperations).toEqual([]);
	});

	it("returns nothing for a workspace that does not exist", async () => {
		expect(
			await getSupportBundle("00000000-0000-4000-8000-00000000dead"),
		).toBeUndefined();
	});
});
