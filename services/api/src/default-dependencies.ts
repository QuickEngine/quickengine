import { verifyApiKey } from "@quickengine/auth/api-keys";
import { resolveWorkspaceAccess } from "@quickengine/auth/rbac";
import { getSession } from "@quickengine/auth/server";
import { and, db, eq, isNull, resolveCustomerSession } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import { getWorkspaceModules } from "@quickengine/module-registry";
import type {
	PlatformDependencies,
	WorkspaceResolution,
} from "./platform-types";

const WORKSPACE_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadWorkspace(workspaceId: string) {
	if (!WORKSPACE_ID_PATTERN.test(workspaceId)) return null;
	const [workspace] = await db
		.select({
			businessType: quickengineWorkspaces.businessType,
			environment: quickengineWorkspaces.environment,
			id: quickengineWorkspaces.id,
			name: quickengineWorkspaces.name,
			organizationId: quickengineWorkspaces.organizationId,
			ownerId: quickengineWorkspaces.ownerId,
			slug: quickengineWorkspaces.slug,
		})
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.id, workspaceId),
				isNull(quickengineWorkspaces.archivedAt),
			),
		)
		.limit(1);
	if (!workspace) return null;

	const modules = await getWorkspaceModules(workspace.id);
	return {
		workspace,
		enabledModuleIds: modules
			.filter((module) => module.enabled)
			.map((module) => module.id),
	};
}

export const defaultPlatformDependencies: PlatformDependencies = {
	async getSession(headers) {
		const session = await getSession(headers);
		return session ? { userId: session.user.id } : null;
	},
	async getWorkspaceForKey(workspaceId) {
		const loaded = await loadWorkspace(workspaceId);
		if (!loaded) return null;
		return {
			enabledModuleIds: loaded.enabledModuleIds,
			organizationId: loaded.workspace.organizationId,
			ownerId: loaded.workspace.ownerId,
			workspace: {
				businessType: loaded.workspace.businessType,
				environment: loaded.workspace.environment,
				id: loaded.workspace.id,
				name: loaded.workspace.name,
				slug: loaded.workspace.slug,
			},
		} satisfies WorkspaceResolution;
	},
	async getWorkspaceForUser(userId, workspaceId) {
		const loaded = await loadWorkspace(workspaceId);
		if (!loaded) return null;
		const access = await resolveWorkspaceAccess(userId, {
			organizationId: loaded.workspace.organizationId,
			ownerId: loaded.workspace.ownerId,
		});
		if (!access) return null;
		return {
			capabilities: access.capabilities,
			enabledModuleIds: loaded.enabledModuleIds,
			organizationId: loaded.workspace.organizationId,
			ownerId: loaded.workspace.ownerId,
			role: access.role,
			workspace: {
				businessType: loaded.workspace.businessType,
				environment: loaded.workspace.environment,
				id: loaded.workspace.id,
				name: loaded.workspace.name,
				slug: loaded.workspace.slug,
			},
		} satisfies WorkspaceResolution;
	},
	// The customer boundary's session lookup. Hashes what was presented, joins
	// the membership, and refuses expired or revoked — see
	// `packages/db/src/customers.ts`.
	resolveCustomerSession,
	verifyApiKey,
};
