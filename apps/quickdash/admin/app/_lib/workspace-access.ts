import { and, db, eq, isNull } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import { getWorkspaceModules } from "@quickengine/module-registry";

export type QuickDashWorkspace = {
	id: string;
	name: string;
	slug: string | null;
	businessType: string;
};

/**
 * The single authorization seam for QuickDash workspace reads. Owner-only is the
 * truthful policy today; workspace memberships and RBAC will extend this function
 * instead of scattering access checks across module pages.
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
		})
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.id, workspaceId),
				eq(quickengineWorkspaces.ownerId, userId),
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
		.where(
			and(
				eq(quickengineWorkspaces.ownerId, userId),
				isNull(quickengineWorkspaces.archivedAt),
			),
		)
		.orderBy(quickengineWorkspaces.createdAt);
}
