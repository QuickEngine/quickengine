import { and, db, eq, isNull } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import { getWorkspaceModules } from "@quickengine/module-registry";
import type { QuickDashAgentRepository } from "./tools";

/**
 * Real QuickDash read adapter. Tools authorize the run's workspace grant before
 * invoking this repository; database reads remain workspace-keyed and exclude
 * archived workspaces.
 */
export function createDatabaseQuickDashAgentRepository(): QuickDashAgentRepository {
	return {
		async getWorkspace(workspaceId) {
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
			return workspace ?? null;
		},
		async listEnabledModules(workspaceId) {
			const [workspace] = await db
				.select({ id: quickengineWorkspaces.id })
				.from(quickengineWorkspaces)
				.where(
					and(
						eq(quickengineWorkspaces.id, workspaceId),
						isNull(quickengineWorkspaces.archivedAt),
					),
				)
				.limit(1);
			if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
			const modules = await getWorkspaceModules(workspaceId);
			return modules
				.filter((module) => module.enabled)
				.map(({ id, name, description }) => ({ id, name, description }));
		},
	};
}
