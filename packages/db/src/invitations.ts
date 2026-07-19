import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./client";
import type {
	QuickEngineInvitationStatus,
	QuickEngineOrgRole,
} from "./schema/quickengine";
import {
	quickengineOrganizationInvitations,
	quickengineOrganizationMembers,
} from "./schema/quickengine";

// Organization invitations. The accept link carries a one-time token; only its sha256 hash
// is stored (never the raw token), mirroring the API-key and contracts signer-token pattern.
// This is the backend service — authorization (who may invite/revoke) is enforced by callers
// via `@quickengine/auth/rbac`'s `can(role, "members.manage")`. Email delivery, the public
// accept page, and the Account UI are a later slice.

const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export type CreatedInvitation = {
	id: string;
	/** The raw accept token — returned once, for the accept link. Never stored. */
	token: string;
};

export async function createOrganizationInvitation(input: {
	organizationId: string;
	email: string;
	role: QuickEngineOrgRole;
	invitedByUserId: string;
	expiresInDays?: number;
}): Promise<CreatedInvitation> {
	const token = randomBytes(32).toString("base64url");
	const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 7) * DAY_MS);
	const [row] = await db
		.insert(quickengineOrganizationInvitations)
		.values({
			organizationId: input.organizationId,
			email: input.email.trim().toLowerCase(),
			role: input.role,
			invitedByUserId: input.invitedByUserId,
			tokenHash: hashToken(token),
			expiresAt,
		})
		.returning({ id: quickengineOrganizationInvitations.id });
	return { id: row.id, token };
}

export type PendingInvitation = {
	id: string;
	organizationId: string;
	email: string;
	role: QuickEngineOrgRole;
	expiresAt: Date;
};

/**
 * The still-open invitation for this token, or null if unknown, already used, revoked, or
 * expired. Lets an accept page show what the invitee is joining before they commit.
 */
export async function getInvitationByToken(
	token: string,
): Promise<PendingInvitation | null> {
	const trimmed = token.trim();
	if (!trimmed) return null;
	const [row] = await db
		.select({
			id: quickengineOrganizationInvitations.id,
			organizationId: quickengineOrganizationInvitations.organizationId,
			email: quickengineOrganizationInvitations.email,
			role: quickengineOrganizationInvitations.role,
			status: quickengineOrganizationInvitations.status,
			expiresAt: quickengineOrganizationInvitations.expiresAt,
		})
		.from(quickengineOrganizationInvitations)
		.where(eq(quickengineOrganizationInvitations.tokenHash, hashToken(trimmed)))
		.limit(1);
	if (row?.status !== "pending") return null;
	if (row.expiresAt.getTime() <= Date.now()) return null;
	return {
		id: row.id,
		organizationId: row.organizationId,
		email: row.email,
		role: row.role,
		expiresAt: row.expiresAt,
	};
}

export type AcceptedInvitation = {
	organizationId: string;
	role: QuickEngineOrgRole;
	// Who sent the invite — so the caller can notify them that it was accepted.
	invitedByUserId: string;
};

/**
 * Redeem a token: create the membership and mark the invitation accepted, atomically. Throws
 * a named error for an unknown, already-used, or expired token. Safe on double-accept (the
 * second call sees a non-pending invitation and throws INVITATION_NOT_PENDING).
 */
export async function acceptOrganizationInvitation(
	token: string,
	acceptedByUserId: string,
): Promise<AcceptedInvitation> {
	const tokenHash = hashToken(token.trim());
	return db.transaction(async (tx) => {
		const [invitation] = await tx
			.select({
				id: quickengineOrganizationInvitations.id,
				organizationId: quickengineOrganizationInvitations.organizationId,
				role: quickengineOrganizationInvitations.role,
				status: quickengineOrganizationInvitations.status,
				expiresAt: quickengineOrganizationInvitations.expiresAt,
				invitedByUserId: quickengineOrganizationInvitations.invitedByUserId,
			})
			.from(quickengineOrganizationInvitations)
			.where(eq(quickengineOrganizationInvitations.tokenHash, tokenHash))
			.limit(1);

		if (!invitation) throw new Error("INVITATION_NOT_FOUND");
		if (invitation.status !== "pending") {
			throw new Error("INVITATION_NOT_PENDING");
		}
		if (invitation.expiresAt.getTime() <= Date.now()) {
			throw new Error("INVITATION_EXPIRED");
		}

		// If the user is already a member, keep their existing membership (no duplicate).
		await tx
			.insert(quickengineOrganizationMembers)
			.values({
				organizationId: invitation.organizationId,
				userId: acceptedByUserId,
				role: invitation.role,
			})
			.onConflictDoNothing({
				target: [
					quickengineOrganizationMembers.organizationId,
					quickengineOrganizationMembers.userId,
				],
			});

		const now = new Date();
		await tx
			.update(quickengineOrganizationInvitations)
			.set({
				status: "accepted",
				acceptedAt: now,
				acceptedByUserId,
				updatedAt: now,
			})
			.where(eq(quickengineOrganizationInvitations.id, invitation.id));

		return {
			organizationId: invitation.organizationId,
			role: invitation.role,
			invitedByUserId: invitation.invitedByUserId,
		};
	});
}

export type InvitationSummary = {
	id: string;
	email: string;
	role: QuickEngineOrgRole;
	status: QuickEngineInvitationStatus;
	expiresAt: Date;
	createdAt: Date;
};

/** Non-secret invitation metadata for an org, newest first. */
export async function listOrganizationInvitations(
	organizationId: string,
): Promise<InvitationSummary[]> {
	return db
		.select({
			id: quickengineOrganizationInvitations.id,
			email: quickengineOrganizationInvitations.email,
			role: quickengineOrganizationInvitations.role,
			status: quickengineOrganizationInvitations.status,
			expiresAt: quickengineOrganizationInvitations.expiresAt,
			createdAt: quickengineOrganizationInvitations.createdAt,
		})
		.from(quickengineOrganizationInvitations)
		.where(
			eq(quickengineOrganizationInvitations.organizationId, organizationId),
		)
		.orderBy(desc(quickengineOrganizationInvitations.createdAt));
}

/** Revoke a pending invitation. False if it isn't this org's, or isn't pending. */
export async function revokeOrganizationInvitation(
	organizationId: string,
	invitationId: string,
): Promise<boolean> {
	const [row] = await db
		.update(quickengineOrganizationInvitations)
		.set({ status: "revoked", updatedAt: new Date() })
		.where(
			and(
				eq(quickengineOrganizationInvitations.id, invitationId),
				eq(quickengineOrganizationInvitations.organizationId, organizationId),
				eq(quickengineOrganizationInvitations.status, "pending"),
			),
		)
		.returning({ id: quickengineOrganizationInvitations.id });
	return Boolean(row);
}
