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
): Promise<QuickEngineOrgRole | null> {
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

export async function updateOrgRole(
	organizationId: string,
	id: string,
	patch: {
		name?: string;
		description?: string | null;
		capabilities?: readonly string[];
	},
) {
	const [role] = await db
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
