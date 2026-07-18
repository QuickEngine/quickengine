import {
	listOrganizationMembers,
	resolveOrgRole,
	resolveWorkspaceRole,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const ownerId = "role-owner";
const memberId = "role-member";
const strangerId = "role-stranger";
const orgId = "00000000-0000-4000-8000-0000000e0001";
const otherOrgId = "00000000-0000-4000-8000-0000000e0002";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified) values
			(${ownerId}, 'Owner', 'owner-role@example.com', true),
			(${memberId}, 'Member', 'member-role@example.com', true),
			(${strangerId}, 'Stranger', 'stranger-role@example.com', true)
	`;
	await sql`
		insert into quickengine_organizations (id, name, slug, is_personal, owner_id)
		values (${orgId}, 'Role Org', 'role-org', false, ${ownerId})
	`;
	await sql`
		insert into quickengine_organization_members (organization_id, user_id, role) values
			(${orgId}, ${ownerId}, 'owner'),
			(${orgId}, ${memberId}, 'member')
	`;
});

describe("resolveWorkspaceRole", () => {
	it("returns the org role for members, null for strangers", async () => {
		const workspace = { ownerId, organizationId: orgId };
		expect(await resolveWorkspaceRole(ownerId, workspace)).toBe("owner");
		expect(await resolveWorkspaceRole(memberId, workspace)).toBe("member");
		expect(await resolveWorkspaceRole(strangerId, workspace)).toBeNull();
	});

	it("treats the workspace owner as owner even without a membership row", async () => {
		expect(
			await resolveWorkspaceRole(ownerId, { ownerId, organizationId: null }),
		).toBe("owner");
		expect(
			await resolveWorkspaceRole(strangerId, { ownerId, organizationId: null }),
		).toBeNull();
	});

	it("does not grant access from a different org", async () => {
		expect(
			await resolveWorkspaceRole(memberId, {
				ownerId: strangerId,
				organizationId: otherOrgId,
			}),
		).toBeNull();
	});

	it("resolveOrgRole returns the org membership role, or null", async () => {
		expect(await resolveOrgRole(ownerId, orgId)).toBe("owner");
		expect(await resolveOrgRole(memberId, orgId)).toBe("member");
		expect(await resolveOrgRole(strangerId, orgId)).toBeNull();
	});

	it("listOrganizationMembers returns members with identity + role", async () => {
		const members = await listOrganizationMembers(orgId);
		expect(members.map((m) => m.role).sort()).toEqual(["member", "owner"]);
		const owner = members.find((m) => m.role === "owner");
		expect(owner?.email).toBe("owner-role@example.com");
	});
});
