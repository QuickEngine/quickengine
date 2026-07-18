import {
	and,
	db,
	eq,
	isNotNull,
	isNull,
	or,
	resolveWorkspaceRole,
} from "@quickengine/db";
import {
	quickengineOrganizationMembers,
	quickengineWorkspaces,
} from "@quickengine/db/schema/quickengine";
import { getWorkspaceModules } from "@quickengine/module-registry";

export type QuickDashWorkspace = {
	id: string;
	name: string;
	slug: string | null;
	businessType: string;
};

/**
 * The single authorization seam for QuickDash workspace reads. Access is now membership-based:
 * the caller must have a role on the workspace's org (the owner is always "owner"). The role is
 * returned so callers can gate manage-vs-operate via `@quickengine/auth/rbac`'s capability
 * checks, instead of scattering access logic across module pages.
 */
const WORKSPACE_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireWorkspaceAccess(
	userId: string,
	workspaceId: string,
) {
	// A non-UUID path segment (e.g. a request for `/logo.svg` that falls through to
	// the `[workspace]` route) must not reach the UUID-typed query — Postgres throws
	// `invalid input syntax for type uuid` and crashes the request. Treat it as a
	// missing workspace so the page renders notFound() instead.
	if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
		return null;
	}
	const [workspace] = await db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			slug: quickengineWorkspaces.slug,
			businessType: quickengineWorkspaces.businessType,
			ownerId: quickengineWorkspaces.ownerId,
			organizationId: quickengineWorkspaces.organizationId,
		})
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.id, workspaceId),
				isNull(quickengineWorkspaces.archivedAt),
			),
		)
		.limit(1);

	if (!workspace) {
		return null;
	}

	const role = await resolveWorkspaceRole(userId, {
		ownerId: workspace.ownerId,
		organizationId: workspace.organizationId,
	});
	if (!role) {
		return null;
	}

	const modules = await getWorkspaceModules(workspace.id);
	return {
		workspace: {
			id: workspace.id,
			name: workspace.name,
			slug: workspace.slug,
			businessType: workspace.businessType,
		},
		modules: modules.filter((module) => module.enabled),
		role,
	};
}

/**
 * Load a workspace and its enabled modules WITHOUT an owner check — for public-API
 * requests authenticated by an API key, whose authorization is the key itself (already
 * scoped to this workspace) rather than a signed-in user. Returns null for a non-UUID or
 * missing/archived workspace. The key layer is responsible for authenticating the caller;
 * this only resolves the workspace + module state the key is scoped to.
 */
export async function loadWorkspaceForKey(workspaceId: string) {
	if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
		return null;
	}
	const [workspace] = await db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			slug: quickengineWorkspaces.slug,
			businessType: quickengineWorkspaces.businessType,
		})
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.id, workspaceId),
				isNull(quickengineWorkspaces.archivedAt),
			),
		)
		.limit(1);

	if (!workspace) {
		return null;
	}

	const modules = await getWorkspaceModules(workspace.id);
	return {
		workspace,
		modules: modules.filter((module) => module.enabled),
	};
}

export async function listAccessibleWorkspaces(
	userId: string,
): Promise<QuickDashWorkspace[]> {
	return db
		.select({
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			slug: quickengineWorkspaces.slug,
			businessType: quickengineWorkspaces.businessType,
		})
		.from(quickengineWorkspaces)
		.leftJoin(
			quickengineOrganizationMembers,
			and(
				eq(
					quickengineOrganizationMembers.organizationId,
					quickengineWorkspaces.organizationId,
				),
				eq(quickengineOrganizationMembers.userId, userId),
			),
		)
		.where(
			and(
				isNull(quickengineWorkspaces.archivedAt),
				or(
					eq(quickengineWorkspaces.ownerId, userId),
					isNotNull(quickengineOrganizationMembers.userId),
				),
			),
		)
		.orderBy(quickengineWorkspaces.createdAt);
}
