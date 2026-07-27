import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { fileDocuments } from "./schema/files";
import {
	quickengineOrganizationMembers,
	quickengineOrganizations,
	quickengineSubscriptions,
	quickengineUsers,
	quickengineWorkspaces,
} from "./schema/quickengine";

// URL-safe org slug from a name + a short random suffix. Org slugs are globally
// unique, so the suffix avoids a collision-checking round-trip.
function orgSlug(name: string): string {
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "org";
	return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export type UserOrganization = {
	id: string;
	name: string;
	slug: string;
	isPersonal: boolean;
	/** A role name, which may be one the organization defined for itself. */
	role: string;
};

/** Every org the user is a member of, personal first (it is created earliest at signup). */
export async function listOrganizationsForUser(
	userId: string,
): Promise<UserOrganization[]> {
	return db
		.select({
			id: quickengineOrganizations.id,
			name: quickengineOrganizations.name,
			slug: quickengineOrganizations.slug,
			isPersonal: quickengineOrganizations.isPersonal,
			role: quickengineOrganizationMembers.role,
		})
		.from(quickengineOrganizationMembers)
		.innerJoin(
			quickengineOrganizations,
			eq(
				quickengineOrganizations.id,
				quickengineOrganizationMembers.organizationId,
			),
		)
		.where(eq(quickengineOrganizationMembers.userId, userId))
		.orderBy(quickengineOrganizations.createdAt);
}

/** Create a shared organization with the creator as its owner member. */
export async function createOrganization(
	name: string,
	ownerId: string,
): Promise<{ id: string; name: string; slug: string }> {
	const trimmed = name.trim() || "Organization";
	const [org] = await db
		.insert(quickengineOrganizations)
		.values({
			name: trimmed,
			slug: orgSlug(trimmed),
			isPersonal: false,
			ownerId,
		})
		.returning({
			id: quickengineOrganizations.id,
			name: quickengineOrganizations.name,
			slug: quickengineOrganizations.slug,
		});
	await db.insert(quickengineOrganizationMembers).values({
		organizationId: org.id,
		userId: ownerId,
		role: "owner",
	});
	return org;
}

/** The user's personal (auto-created solo) org, or undefined if none exists yet. */
export async function getPersonalOrg(userId: string) {
	const [org] = await db
		.select()
		.from(quickengineOrganizations)
		.where(
			and(
				eq(quickengineOrganizations.ownerId, userId),
				eq(quickengineOrganizations.isPersonal, true),
			),
		)
		.limit(1);
	return org;
}

/**
 * Ensure a user has their personal org (their solo space) + an owner membership.
 * Idempotent — safe to call on signup and on demand for pre-existing users.
 * Returns the personal org id.
 */
export async function ensurePersonalOrg(
	userId: string,
	displayName: string,
): Promise<string> {
	const existing = await getPersonalOrg(userId);
	if (existing) {
		return existing.id;
	}
	const name = displayName.trim() || "Personal";
	const [org] = await db
		.insert(quickengineOrganizations)
		.values({
			name,
			slug: orgSlug(name),
			isPersonal: true,
			ownerId: userId,
		})
		.returning({ id: quickengineOrganizations.id });
	await db.insert(quickengineOrganizationMembers).values({
		organizationId: org.id,
		userId,
		role: "owner",
	});
	return org.id;
}

export type OrganizationMember = {
	userId: string;
	name: string;
	email: string;
	/** A role name, which may be one the organization defined for itself. */
	role: string;
	joinedAt: Date;
};

/** The members of an org with their identity + role, oldest first (owner is typically first). */
export async function listOrganizationMembers(
	organizationId: string,
): Promise<OrganizationMember[]> {
	return db
		.select({
			userId: quickengineOrganizationMembers.userId,
			name: quickengineUsers.name,
			email: quickengineUsers.email,
			role: quickengineOrganizationMembers.role,
			joinedAt: quickengineOrganizationMembers.createdAt,
		})
		.from(quickengineOrganizationMembers)
		.innerJoin(
			quickengineUsers,
			eq(quickengineOrganizationMembers.userId, quickengineUsers.id),
		)
		.where(eq(quickengineOrganizationMembers.organizationId, organizationId))
		.orderBy(quickengineOrganizationMembers.createdAt);
}

/**
 * Remove a member from an org. The org owner can never be removed. Returns false if the
 * target is the owner or is not a member.
 */
export async function removeOrganizationMember(
	organizationId: string,
	userId: string,
): Promise<boolean> {
	const [org] = await db
		.select({ ownerId: quickengineOrganizations.ownerId })
		.from(quickengineOrganizations)
		.where(eq(quickengineOrganizations.id, organizationId))
		.limit(1);
	if (!org || org.ownerId === userId) {
		return false;
	}
	const [removed] = await db
		.delete(quickengineOrganizationMembers)
		.where(
			and(
				eq(quickengineOrganizationMembers.organizationId, organizationId),
				eq(quickengineOrganizationMembers.userId, userId),
			),
		)
		.returning({ userId: quickengineOrganizationMembers.userId });
	return Boolean(removed);
}

/**
 * Permanently delete a user and everything they own.
 *
 * **Refuses while any owned workspace still holds stored files.** Deleting the
 * rows would orphan the bytes in blob storage — billed forever, attached to
 * nobody, and unreachable for a later erasure request. Throws
 * `ACCOUNT_HAS_STORED_FILES` so the caller can tell the user what to clear first.
 *
 * One transaction: a half-deleted account is worse than either outcome.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
	const [storedFile] = await db
		.select({ id: fileDocuments.id })
		.from(fileDocuments)
		.innerJoin(
			quickengineWorkspaces,
			and(
				eq(quickengineWorkspaces.id, fileDocuments.workspaceId),
				eq(quickengineWorkspaces.ownerId, userId),
			),
		)
		.limit(1);
	if (storedFile) throw new Error("ACCOUNT_HAS_STORED_FILES");

	await db.transaction(async (tx) => {
		await tx
			.delete(quickengineSubscriptions)
			.where(eq(quickengineSubscriptions.userId, userId));
		await tx
			.delete(quickengineOrganizations)
			.where(eq(quickengineOrganizations.ownerId, userId));
		await tx.delete(quickengineUsers).where(eq(quickengineUsers.id, userId));
	});
}
