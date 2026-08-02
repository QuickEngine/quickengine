import {
	listControlPlaneAudit,
	recordControlPlaneAudit,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "cpa-owner";
const orgId = "00000000-0000-4000-8000-00000000cfa1";
const otherOrgId = "00000000-0000-4000-8000-00000000cfa2";
const workspaceId = "00000000-0000-4000-8000-00000000cfa3";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified)
		values (${ownerId}, 'CPA Owner', 'cpa@example.com', true)
	`;
	await sql`
		insert into quickengine_organizations (id, name, slug, owner_id)
		values (${orgId}, 'Mine', 'cpa-mine', ${ownerId}),
		       (${otherOrgId}, 'Theirs', 'cpa-theirs', ${ownerId})
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, organization_id, name, business_type)
		values (${workspaceId}, ${ownerId}, ${orgId}, 'CPA Workspace', 'agency')
	`;
});

describe("control plane audit", () => {
	/**
	 * 🔴 The gap this closes. `api_audit_events.workspace_id` was NOT NULL, and
	 * the control plane is org-scoped — so roles, members, API keys and
	 * subscriptions could not be audited at all. A member could be granted
	 * billing.manage and later removed with no evidence anyone did it.
	 */
	it("records an organization event with no workspace", async () => {
		await recordControlPlaneAudit({
			organizationId: orgId,
			actorId: ownerId,
			actorType: "user",
			action: "member.removed",
			resourceType: "member",
			resourceId: "someone-else",
			requestId: "req-1",
		});

		const entries = await listControlPlaneAudit(orgId);
		expect(entries).toHaveLength(1);
		expect(entries[0]?.action).toBe("member.removed");
		expect(entries[0]?.actorId).toBe(ownerId);
	});

	it("never returns another organization's trail", async () => {
		await recordControlPlaneAudit({
			organizationId: orgId,
			actorId: ownerId,
			actorType: "user",
			action: "role.created",
			resourceType: "role",
			resourceId: "r1",
			requestId: "req-2",
		});
		await recordControlPlaneAudit({
			organizationId: otherOrgId,
			actorId: ownerId,
			actorType: "user",
			action: "role.created",
			resourceType: "role",
			resourceId: "r2",
			requestId: "req-3",
		});

		expect((await listControlPlaneAudit(orgId))[0]?.resourceId).toBe("r1");
		expect((await listControlPlaneAudit(otherOrgId))[0]?.resourceId).toBe("r2");
	});

	// Module writes belong to the workspace feed, not the account's security log.
	it("excludes workspace-scoped rows from the control-plane feed", async () => {
		const sql = testDbClient();
		await sql`
			insert into api_audit_events
				(workspace_id, organization_id, actor_type, actor_id, action, resource_type, resource_id, request_id, source)
			values (${workspaceId}, ${orgId}, 'user', ${ownerId}, 'invoice.created', 'invoice', 'inv-1', 'req-4', 'api')
		`;

		expect(await listControlPlaneAudit(orgId)).toHaveLength(0);
	});

	// A row with neither scope belongs to nobody and no query could ever read it.
	it("rejects a row with no scope at all", async () => {
		const sql = testDbClient();
		await expect(
			sql`
				insert into api_audit_events
					(actor_type, actor_id, action, resource_type, resource_id, request_id, source)
				values ('user', ${ownerId}, 'orphan', 'thing', 'x', 'req-5', 'api')
			`,
		).rejects.toThrow();
	});

	// An audit failure must never undo a change that already committed.
	it("never throws, even on an invalid organization", async () => {
		await expect(
			recordControlPlaneAudit({
				organizationId: "00000000-0000-4000-8000-00000000dead",
				actorId: ownerId,
				actorType: "user",
				action: "role.created",
				resourceType: "role",
				resourceId: "r9",
				requestId: "req-6",
			}),
		).resolves.toBeUndefined();
	});
});
