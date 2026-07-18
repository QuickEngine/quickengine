import { can, type WorkspaceCapability } from "@quickengine/auth/rbac";
import { and, db, eq, resolveWorkspaceRole } from "@quickengine/db";
import type { QuickEngineOrgRole } from "@quickengine/db/schema/quickengine";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";

export type AuthorizedWorkspace = {
	id: string;
	slug: string | null;
	name: string;
	archivedAt: Date | null;
	role: QuickEngineOrgRole;
};

export type WorkspaceAuthzResult =
	| { ok: true; workspace: AuthorizedWorkspace }
	| { ok: false; message: string };

/**
 * Resolve a workspace by id + slug and confirm the caller holds `capability` via their org
 * role. This replaces the old owner-only management checks, so an admin can manage per the
 * capability model while `workspace.delete` stays owner-only (only `owner` holds it). A
 * non-member is reported as "not found" so a workspace's existence never leaks.
 */
export async function authorizeWorkspace(
	userId: string,
	workspaceId: string,
	slug: string,
	capability: WorkspaceCapability,
): Promise<WorkspaceAuthzResult> {
	const [workspace] = await db
		.select({
			id: quickengineWorkspaces.id,
			slug: quickengineWorkspaces.slug,
			name: quickengineWorkspaces.name,
			archivedAt: quickengineWorkspaces.archivedAt,
			ownerId: quickengineWorkspaces.ownerId,
			organizationId: quickengineWorkspaces.organizationId,
		})
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.id, workspaceId),
				eq(quickengineWorkspaces.slug, slug),
			),
		)
		.limit(1);
	if (!workspace) {
		return { ok: false, message: "Workspace not found." };
	}

	const role = await resolveWorkspaceRole(userId, {
		ownerId: workspace.ownerId,
		organizationId: workspace.organizationId,
	});
	if (!role) {
		return { ok: false, message: "Workspace not found." };
	}
	if (!can(role, capability)) {
		return { ok: false, message: "You do not have permission to do that." };
	}

	return {
		ok: true,
		workspace: {
			id: workspace.id,
			slug: workspace.slug,
			name: workspace.name,
			archivedAt: workspace.archivedAt,
			role,
		},
	};
}
