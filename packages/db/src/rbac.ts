import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import type { QuickEngineOrgRole } from "./schema/quickengine";
import {
	quickengineOrganizationMembers,
	quickengineOrganizationRoles,
} from "./schema/quickengine";

/**
 * Resolve a user's role on a workspace from org membership — the single membership resolver
 * the authorization seams build on. The workspace owner is always "owner" (even on legacy
 * rows that predate `organizationId`); otherwise the role comes from the org membership row.
 * Returns null when the user has no access at all.
 */
export async function resolveWorkspaceRole(
	userId: string,
	workspace: { ownerId: string; organizationId: string | null },
): Promise<string | null> {
	if (workspace.ownerId === userId) {
		return "owner";
	}
	if (!workspace.organizationId) {
		return null;
	}
	const [member] = await db
		.select({ role: quickengineOrganizationMembers.role })
		.from(quickengineOrganizationMembers)
		.where(
			and(
				eq(
					quickengineOrganizationMembers.organizationId,
					workspace.organizationId,
				),
				eq(quickengineOrganizationMembers.userId, userId),
			),
		)
		.limit(1);
	return member?.role ?? null;
}

/** A user's role directly on an organization, or null if they are not a member. */
export async function resolveOrgRole(
	userId: string,
	organizationId: string,
): Promise<string | null> {
	const [member] = await db
		.select({ role: quickengineOrganizationMembers.role })
		.from(quickengineOrganizationMembers)
		.where(
			and(
				eq(quickengineOrganizationMembers.organizationId, organizationId),
				eq(quickengineOrganizationMembers.userId, userId),
			),
		)
		.limit(1);
	return member?.role ?? null;
}

/**
 * Every custom role an organization has defined, keyed by lowercased name.
 *
 * Shaped for `resolveCapabilities` in `@quickengine/auth/rbac`, which takes exactly
 * this map. Built-in roles are deliberately absent: they live in code, are checked
 * first, and must never be shadowed by a row.
 *
 * **Additive on its own** — nothing calls this yet. Wiring it into
 * `resolveWorkspaceRole` is the next slice, and until then every existing role
 * behaves exactly as before.
 */
export async function loadOrgRoleCapabilities(
	organizationId: string,
): Promise<Map<string, readonly string[]>> {
	const rows = await db
		.select({
			name: quickengineOrganizationRoles.name,
			capabilities: quickengineOrganizationRoles.capabilities,
		})
		.from(quickengineOrganizationRoles)
		.where(eq(quickengineOrganizationRoles.organizationId, organizationId));
	return new Map(
		rows.map((row) => [row.name.toLowerCase(), row.capabilities ?? []]),
	);
}

/** Every custom role an organization has defined, for management surfaces. */
export async function listOrgRoles(organizationId: string) {
	return db
		.select()
		.from(quickengineOrganizationRoles)
		.where(eq(quickengineOrganizationRoles.organizationId, organizationId))
		.orderBy(asc(quickengineOrganizationRoles.name));
}

/**
 * How many members currently hold a role.
 *
 * Deleting a role somebody holds would leave them resolving to no capabilities —
 * silently losing access with nothing explaining why. Callers check this first and
 * refuse rather than orphan a member.
 */
export async function countMembersWithRole(
	organizationId: string,
	roleName: string,
): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(quickengineOrganizationMembers)
		.where(
			and(
				eq(quickengineOrganizationMembers.organizationId, organizationId),
				sql`lower(${quickengineOrganizationMembers.role}) = lower(${roleName})`,
			),
		);
	return Number(row?.count ?? 0);
}

export async function createOrgRole(input: {
	organizationId: string;
	name: string;
	description?: string | null;
	capabilities: readonly string[];
}) {
	const [role] = await db
		.insert(quickengineOrganizationRoles)
		.values({
			organizationId: input.organizationId,
			name: input.name.trim(),
			description: input.description ?? null,
			capabilities: [...input.capabilities],
		})
		.returning();
	return role;
}

/**
 * Update a role, **carrying its members with it on a rename.**
 *
 * Membership stores the role's *name*, and capabilities resolve by lowercased name.
 * So renaming the row alone would leave every holder pointing at a name that no
 * longer exists — they would resolve to no capabilities and lose access silently,
 * which is precisely the failure `countMembersWithRole` guards against on delete.
 *
 * Renaming is allowed rather than refused because the name is decoration: nothing
 * branches on it. Both writes therefore happen in one transaction, so a rename can
 * never half-apply and strand members between the old name and the new one.
 */
export async function updateOrgRole(
	organizationId: string,
	id: string,
	patch: {
		name?: string;
		description?: string | null;
		capabilities?: readonly string[];
	},
) {
	const role = await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ name: quickengineOrganizationRoles.name })
			.from(quickengineOrganizationRoles)
			.where(
				and(
					eq(quickengineOrganizationRoles.organizationId, organizationId),
					eq(quickengineOrganizationRoles.id, id),
				),
			);
		if (!existing) return undefined;

		const [updated] = await tx
			.update(quickengineOrganizationRoles)
			.set({
				...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
				...(patch.description !== undefined
					? { description: patch.description }
					: {}),
				...(patch.capabilities !== undefined
					? { capabilities: [...patch.capabilities] }
					: {}),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(quickengineOrganizationRoles.organizationId, organizationId),
					eq(quickengineOrganizationRoles.id, id),
				),
			)
			.returning();

		const renamed = patch.name?.trim();
		if (renamed && renamed.toLowerCase() !== existing.name.toLowerCase()) {
			await tx
				.update(quickengineOrganizationMembers)
				.set({ role: renamed })
				.where(
					and(
						eq(quickengineOrganizationMembers.organizationId, organizationId),
						sql`lower(${quickengineOrganizationMembers.role}) = lower(${existing.name})`,
					),
				);
		}
		return updated;
	});
	return role;
}

export async function deleteOrgRole(organizationId: string, id: string) {
	const [role] = await db
		.delete(quickengineOrganizationRoles)
		.where(
			and(
				eq(quickengineOrganizationRoles.organizationId, organizationId),
				eq(quickengineOrganizationRoles.id, id),
			),
		)
		.returning();
	return role;
}
