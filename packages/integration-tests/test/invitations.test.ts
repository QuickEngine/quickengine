import {
	acceptOrganizationInvitation,
	createOrganizationInvitation,
	getInvitationByToken,
	listOrganizationInvitations,
	removeOrganizationMember,
	resolveOrgRole,
	resolveWorkspaceRole,
	revokeOrganizationInvitation,
} from "@quickengine/db";
import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";

const inviterId = "inv-owner";
const inviteeId = "inv-invitee";
const orgId = "00000000-0000-4000-8000-0000000f0001";
const workspaceId = "00000000-0000-4000-8000-0000000f0010";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`
		insert into quickengine_users (id, name, email, email_verified) values
			(${inviterId}, 'Inviter', 'inviter@example.com', true),
			(${inviteeId}, 'Invitee', 'invitee@example.com', true)
	`;
	await sql`
		insert into quickengine_organizations (id, name, slug, is_personal, owner_id)
		values (${orgId}, 'Invite Org', 'invite-org', false, ${inviterId})
	`;
	await sql`
		insert into quickengine_organization_members (organization_id, user_id, role)
		values (${orgId}, ${inviterId}, 'owner')
	`;
	await sql`
		insert into quickengine_workspaces (id, owner_id, organization_id, name, business_type)
		values (${workspaceId}, ${inviterId}, ${orgId}, 'Invite WS', 'ecommerce')
	`;
});

async function invite(
	role: "admin" | "member" = "member",
	expiresInDays?: number,
) {
	return createOrganizationInvitation({
		organizationId: orgId,
		email: "invitee@example.com",
		role,
		invitedByUserId: inviterId,
		expiresInDays,
	});
}

describe("organization invitations", () => {
	it("create → accept adds the member with the invited role", async () => {
		const { token } = await invite("admin");

		const pending = await getInvitationByToken(token);
		expect(pending).toMatchObject({ organizationId: orgId, role: "admin" });

		const accepted = await acceptOrganizationInvitation(token, inviteeId);
		expect(accepted).toEqual({
			organizationId: orgId,
			role: "admin",
			invitedByUserId: inviterId,
		});

		// The invitee now has the "admin" role on the org's workspace (Slice 1 seam).
		expect(
			await resolveWorkspaceRole(inviteeId, {
				ownerId: inviterId,
				organizationId: orgId,
			}),
		).toBe("admin");
	});

	it("cannot be accepted twice", async () => {
		const { token } = await invite();
		await acceptOrganizationInvitation(token, inviteeId);
		await expect(
			acceptOrganizationInvitation(token, inviteeId),
		).rejects.toThrow("INVITATION_NOT_PENDING");
	});

	it("rejects an expired token", async () => {
		const { token } = await invite("member", -1);
		expect(await getInvitationByToken(token)).toBeNull();
		await expect(
			acceptOrganizationInvitation(token, inviteeId),
		).rejects.toThrow("INVITATION_EXPIRED");
	});

	it("rejects an unknown token", async () => {
		expect(await getInvitationByToken("nope")).toBeNull();
		await expect(
			acceptOrganizationInvitation("nope", inviteeId),
		).rejects.toThrow("INVITATION_NOT_FOUND");
	});

	it("revoke closes a pending invitation and blocks acceptance", async () => {
		const { id, token } = await invite();
		expect(await revokeOrganizationInvitation(orgId, id)).toBe(true);
		// Revoking again is a no-op.
		expect(await revokeOrganizationInvitation(orgId, id)).toBe(false);
		expect(await getInvitationByToken(token)).toBeNull();
		await expect(
			acceptOrganizationInvitation(token, inviteeId),
		).rejects.toThrow("INVITATION_NOT_PENDING");
	});

	it("lists invitations for the org, newest first", async () => {
		await invite("member");
		await invite("admin");
		const rows = await listOrganizationInvitations(orgId);
		expect(rows).toHaveLength(2);
		for (const row of rows) {
			expect(Object.hasOwn(row, "tokenHash")).toBe(false);
		}
	});

	it("removes a member but never the org owner", async () => {
		const { token } = await invite();
		await acceptOrganizationInvitation(token, inviteeId);
		expect(await resolveOrgRole(inviteeId, orgId)).toBe("member");

		// The owner can never be removed.
		expect(await removeOrganizationMember(orgId, inviterId)).toBe(false);
		expect(await resolveOrgRole(inviterId, orgId)).toBe("owner");

		// A member can be removed; afterward they have no role.
		expect(await removeOrganizationMember(orgId, inviteeId)).toBe(true);
		expect(await resolveOrgRole(inviteeId, orgId)).toBeNull();

		// Removing a non-member is a no-op.
		expect(await removeOrganizationMember(orgId, inviteeId)).toBe(false);
	});
});
