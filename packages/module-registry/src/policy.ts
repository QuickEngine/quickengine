import { getModule } from "./catalog";
import { FOUNDATION_MODULE_IDS, resolveModules } from "./resolver";

const FOUNDATION_IDS = new Set<string>(FOUNDATION_MODULE_IDS);

/** Enabled modules whose dependency graph includes `moduleId`. */
export function findEnabledDependents(
	moduleId: string,
	enabledModuleIds: readonly string[],
): readonly string[] {
	if (!getModule(moduleId)) {
		throw new Error(`UNKNOWN_MODULE:${moduleId}`);
	}

	return enabledModuleIds.filter((enabledId) => {
		if (enabledId === moduleId) {
			return false;
		}
		return resolveModules([enabledId]).some((module) => module.id === moduleId);
	});
}

/**
 * Reject a disable before any database write. Foundation modules are permanent;
 * optional modules are protected while another enabled module depends on them.
 */
export function assertModuleCanBeDisabled(
	moduleId: string,
	enabledModuleIds: readonly string[],
): void {
	if (!getModule(moduleId)) {
		throw new Error(`UNKNOWN_MODULE:${moduleId}`);
	}
	if (FOUNDATION_IDS.has(moduleId)) {
		throw new Error(`FOUNDATION_MODULE_REQUIRED:${moduleId}`);
	}

	const dependents = findEnabledDependents(moduleId, enabledModuleIds);
	if (dependents.length > 0) {
		throw new Error(`MODULE_REQUIRED_BY:${moduleId}:${dependents.join(",")}`);
	}
}

/** Validate and normalize a module's workspace settings through its own contract. */
export function parseModuleSettings(
	moduleId: string,
	settings: unknown,
): Record<string, unknown> {
	const module = getModule(moduleId);
	if (!module) {
		throw new Error(`UNKNOWN_MODULE:${moduleId}`);
	}
	return module.settingsSchema.parse(settings) as Record<string, unknown>;
}

/** Merge a settings patch into saved values, then validate the complete result. */
export function mergeModuleSettings(
	moduleId: string,
	current: Record<string, unknown>,
	patch: Record<string, unknown>,
): Record<string, unknown> {
	return parseModuleSettings(moduleId, { ...current, ...patch });
}
