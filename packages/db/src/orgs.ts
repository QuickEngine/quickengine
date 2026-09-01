import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { fileDocuments } from "./schema/files";
import {
	quickengineAccounts,
	quickengineOrganizationMembers,
	quickengineOrganizations,
	quickengineSubscriptions,
	quickengineUsers,
	quickengineWorkspaces,
} from "./schema/quickengine";
import { trimRepeated } from "./slug";

// URL-safe org slug from a name + a short random suffix. Org slugs are globally
// unique, so the suffix avoids a collision-checking round-trip.
function orgSlug(name: string): string {
	const base =
		trimRepeated(name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "-") || "org";
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
/**
 * Name the user's auto-created org after their business, at onboarding.
 *
 * 🔑 Why this exists. Signup calls `ensurePersonalOrg(userId, displayName)`,
 * which names the organisation after the PERSON — the Vercel model, where a
 * personal account is a real scope because developers have side projects.
 * QuickEngine's customers are businesses from the first minute, so that left the
 * billing entity called "Asher Wilson" while the thing actually named after the
 * company was one workspace inside it. Inverted, and confusing the moment you
 * saw both switchers.
 *
 * Linear's model instead: you name your company once and it names the
 * organisation. The auto-created org stays — the auth flow needs one to exist at
 * signup, before onboarding runs — but it becomes an invisible placeholder that
 * gets its real name here.
 *
 * Only ever touches a `isPersonal` org, and clears the flag. A user who has
 * already created a real organisation, or been invited to someone else's, keeps
 * whatever it is called.
 */
export async function nameOrganizationFromBusiness(
	userId: string,
	businessName: string,
): Promise<void> {
	const name = businessName.trim();
	if (!name) return;
	const personal = await getPersonalOrg(userId);
	if (!personal) return;
	await db
		.update(quickengineOrganizations)
		.set({ name, slug: orgSlug(name), isPersonal: false })
		.where(eq(quickengineOrganizations.id, personal.id));
}

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
 * Change a member's role.
 *
 * 🔴 **Refuses on the organization owner**, exactly as removal does. Demoting the
 * owner leaves nobody who can manage billing or appoint a replacement, and there
 * is no way back from it — the owner has to be transferred first, which is a
 * separate deliberate act rather than a side effect of editing a dropdown.
 *
 * Returns false when the member is not in this organization or is its owner. The
 * route turns that into a refusal the operator can read; whether the ROLE itself
 * is one they are allowed to hand out is decided above this layer, where the
 * caller's own capabilities are known.
 */
export async function updateOrganizationMemberRole(
	organizationId: string,
	userId: string,
	role: string,
): Promise<boolean> {
	const [org] = await db
		.select({ ownerId: quickengineOrganizations.ownerId })
		.from(quickengineOrganizations)
		.where(eq(quickengineOrganizations.id, organizationId))
		.limit(1);
	if (!org || org.ownerId === userId) {
		return false;
	}
	const [updated] = await db
		.update(quickengineOrganizationMembers)
		.set({ role })
		.where(
			and(
				eq(quickengineOrganizationMembers.organizationId, organizationId),
				eq(quickengineOrganizationMembers.userId, userId),
			),
		)
		.returning({ userId: quickengineOrganizationMembers.userId });
	return Boolean(updated);
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

/** Fresh first-run state for authenticated app routing. */
/**
 * A person's own profile — the human, not the business.
 *
 * ⚠️ The distinction matters and is easy to lose: the BUSINESS is the
 * workspace/organization and is named on `quickengine_workspaces` /
 * `quickengine_organizations`. This is the individual behind the login, and it
 * is what a future discovery surface would list.
 *
 * Every field is optional so one screen can save whichever parts it collected —
 * onboarding sets a name and maybe pictures; settings later edits one at a time.
 * `undefined` means "not touching this", which is why `null` has to remain a
 * legal value: it is how a picture is REMOVED, and folding the two together
 * would make a banner impossible to clear once set.
 */
export async function updateUserProfile(
	userId: string,
	patch: {
		firstName?: string;
		lastName?: string;
		nickname?: string | null;
		timezone?: string;
		country?: string;
		language?: string;
		theme?: "light" | "dark" | "system";
		image?: string | null;
		bannerImage?: string | null;
	},
): Promise<void> {
	const values: Partial<typeof quickengineUsers.$inferInsert> = {};
	if (patch.firstName !== undefined) values.firstName = patch.firstName;
	if (patch.lastName !== undefined) values.lastName = patch.lastName;
	if (patch.nickname !== undefined) values.nickname = patch.nickname;
	if (patch.timezone !== undefined) values.timezone = patch.timezone;
	if (patch.country !== undefined) values.country = patch.country;
	if (patch.language !== undefined) values.language = patch.language;
	if (patch.theme !== undefined) values.theme = patch.theme;

	/**
	 * 🔴 `name` is COMPOSED here rather than accepted from the caller.
	 *
	 * It is Better Auth's own `notNull` column and is read by `ensurePersonalOrg`
	 * and by `console-shell.tsx` (`name || "Account"`). Letting a client send it
	 * alongside the halves would allow the three to disagree — a first name of
	 * "Ada", a last name of "Lovelace" and a display name of "Bob" — and nothing
	 * downstream could tell which was true.
	 *
	 * Only rewritten when a half actually changed, so updating a picture never
	 * touches it.
	 */
	if (patch.firstName !== undefined || patch.lastName !== undefined) {
		const [current] = await db
			.select({
				firstName: quickengineUsers.firstName,
				lastName: quickengineUsers.lastName,
			})
			.from(quickengineUsers)
			.where(eq(quickengineUsers.id, userId))
			.limit(1);
		const first = patch.firstName ?? current?.firstName ?? "";
		const last = patch.lastName ?? current?.lastName ?? "";
		const composed = `${first} ${last}`.trim();
		// Never blank it: `name` is NOT NULL, and an empty string is what makes the
		// console greet somebody as "Account".
		if (composed) values.name = composed;
	}
	if (patch.image !== undefined) values.image = patch.image;
	if (patch.bannerImage !== undefined) values.bannerImage = patch.bannerImage;
	if (Object.keys(values).length === 0) return;

	await db
		.update(quickengineUsers)
		.set({ ...values, updatedAt: new Date() })
		.where(eq(quickengineUsers.id, userId));
}

export async function getUserOnboardingState(userId: string) {
	const [user] = await db
		.select({
			companyName: quickengineUsers.companyName,
			onboardingCompletedAt: quickengineUsers.onboardingCompletedAt,
			twoFactorEnabled: quickengineUsers.twoFactorEnabled,
		})
		.from(quickengineUsers)
		.where(eq(quickengineUsers.id, userId))
		.limit(1);
	const [credential] = await db
		.select({ id: quickengineAccounts.id })
		.from(quickengineAccounts)
		.where(
			and(
				eq(quickengineAccounts.userId, userId),
				eq(quickengineAccounts.providerId, "credential"),
			),
		)
		.limit(1);
	return user ? { ...user, hasPassword: Boolean(credential) } : null;
}
