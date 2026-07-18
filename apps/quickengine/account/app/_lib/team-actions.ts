"use server";

import { can } from "@quickengine/auth/rbac";
import { getSession } from "@quickengine/auth/server";
import {
	acceptOrganizationInvitation,
	createOrganizationInvitation,
	getPersonalOrg,
	removeOrganizationMember,
	resolveOrgRole,
	revokeOrganizationInvitation,
} from "@quickengine/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

// Roles that can be invited. "owner" is the org creator and is never handed out via invite.
const INVITABLE_ROLES = ["admin", "member"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type InviteMemberState = {
	error: string | null;
	// Set on success — the accept token is shown ONCE so the inviter can copy the link.
	invite: { email: string; role: InvitableRole; token: string } | null;
};

export type RevokeInviteState = { error: string | null };
export type AcceptInviteState = { error: string | null; success: boolean };
export type RemoveMemberState = { error: string | null };

// Resolve the caller's own org + confirm they may manage members, or return an error message.
async function requireMemberManager(): Promise<
	{ organizationId: string; userId: string } | { error: string }
> {
	const session = await getSession(await headers());
	if (!session) return { error: "Your session expired. Please sign in again." };
	const org = await getPersonalOrg(session.user.id);
	if (!org) return { error: "No organization was found for your account." };
	const role = await resolveOrgRole(session.user.id, org.id);
	if (!role || !can(role, "members.manage")) {
		return { error: "You do not have permission to manage members." };
	}
	return { organizationId: org.id, userId: session.user.id };
}

export async function inviteMemberAction(
	_previous: InviteMemberState,
	formData: FormData,
): Promise<InviteMemberState> {
	const gate = await requireMemberManager();
	if ("error" in gate) return { error: gate.error, invite: null };

	const email = String(formData.get("email") ?? "")
		.trim()
		.toLowerCase();
	const role = String(formData.get("role") ?? "member");
	if (!EMAIL_PATTERN.test(email)) {
		return { error: "Enter a valid email address.", invite: null };
	}
	if (!INVITABLE_ROLES.includes(role as InvitableRole)) {
		return { error: "Choose a valid role.", invite: null };
	}

	const { token } = await createOrganizationInvitation({
		organizationId: gate.organizationId,
		email,
		role: role as InvitableRole,
		invitedByUserId: gate.userId,
	});

	revalidatePath("/team");
	return { error: null, invite: { email, role: role as InvitableRole, token } };
}

export async function revokeInviteAction(
	_previous: RevokeInviteState,
	formData: FormData,
): Promise<RevokeInviteState> {
	const gate = await requireMemberManager();
	if ("error" in gate) return { error: gate.error };

	const invitationId = String(formData.get("invitationId") ?? "");
	const revoked = await revokeOrganizationInvitation(
		gate.organizationId,
		invitationId,
	);
	if (!revoked) return { error: "That invitation is no longer pending." };

	revalidatePath("/team");
	return { error: null };
}

export async function removeMemberAction(
	_previous: RemoveMemberState,
	formData: FormData,
): Promise<RemoveMemberState> {
	const gate = await requireMemberManager();
	if ("error" in gate) return { error: gate.error };

	const userId = String(formData.get("userId") ?? "");
	if (!userId) return { error: "No member was specified." };

	const removed = await removeOrganizationMember(gate.organizationId, userId);
	if (!removed) {
		return {
			error: "The owner can't be removed, or that member has already left.",
		};
	}

	revalidatePath("/team");
	return { error: null };
}

export async function acceptInviteAction(
	_previous: AcceptInviteState,
	formData: FormData,
): Promise<AcceptInviteState> {
	const session = await getSession(await headers());
	if (!session) {
		return {
			error: "Please sign in to accept this invitation.",
			success: false,
		};
	}
	const token = String(formData.get("token") ?? "");
	try {
		await acceptOrganizationInvitation(token, session.user.id);
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (message === "INVITATION_EXPIRED") {
			return { error: "This invitation has expired.", success: false };
		}
		if (message === "INVITATION_NOT_PENDING") {
			return {
				error: "This invitation has already been used or was revoked.",
				success: false,
			};
		}
		return { error: "This invitation link is invalid.", success: false };
	}
	revalidatePath("/");
	revalidatePath("/team");
	return { error: null, success: true };
}
