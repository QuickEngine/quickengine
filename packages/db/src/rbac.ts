import { and, eq } from "drizzle-orm";
import { db } from "./client";
import type { QuickEngineOrgRole } from "./schema/quickengine";
import { quickengineOrganizationMembers } from "./schema/quickengine";

/**
 * Resolve a user's role on a workspace from org membership — the single membership resolver
 * the authorization seams build on. The workspace owner is always "owner" (even on legacy
 * rows that predate `organizationId`); otherwise the role comes from the org membership row.
 * Returns null when the user has no access at all.
 */
export async function resolveWorkspaceRole(
	userId: string,
	workspace: { ownerId: string; organizationId: string | null },
): Promise<QuickEngineOrgRole | null> {
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
