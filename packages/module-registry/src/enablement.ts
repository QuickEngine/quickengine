import { parseModuleSettings } from "./policy";
import { resolveModules } from "./resolver";

export type StoredWorkspaceModule = {
	moduleId: string;
	enabled: boolean;
	settings: Record<string, unknown>;
};

export type ModuleEnablePlanItem = {
	moduleId: string;
	settings: Record<string, unknown>;
	isNew: boolean;
};

/**
 * Produce the dependency-first writes needed to enable one module. Already-enabled
 * rows need no write; disabled rows keep their settings when re-enabled.
 */
export function planModuleEnablement(
	moduleId: string,
	storedModules: readonly StoredWorkspaceModule[],
): readonly ModuleEnablePlanItem[] {
	return planModulesEnablement([moduleId], storedModules);
}

/** Produce one deduplicated, dependency-first plan for a set such as a recipe. */
export function planModulesEnablement(
	moduleIds: readonly string[],
	storedModules: readonly StoredWorkspaceModule[],
): readonly ModuleEnablePlanItem[] {
	const existing = new Map(storedModules.map((row) => [row.moduleId, row]));

	return resolveModules(moduleIds).flatMap((module) => {
		const row = existing.get(module.id);
		if (row?.enabled) {
			return [];
		}
		return [
			{
				moduleId: module.id,
				settings: row
					? parseModuleSettings(module.id, row.settings)
					: (module.defaultSettings as Record<string, unknown>),
				isNew: !row,
			},
		];
	});
}
