import { and, eq } from "drizzle-orm";
import { db } from "./client";
import {
	quickengineOrganizationMembers,
	quickengineOrganizations,
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
