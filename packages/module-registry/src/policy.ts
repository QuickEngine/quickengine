import { getModule } from "./catalog";
import { resolveModules } from "./resolver";

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
 * Reject a disable before any database write. No module is permanently locked — a
 * module is protected only while another *enabled* module genuinely depends on it
 * (the real dependency graph), never by an artificial "foundation" rule.
 */
export function assertModuleCanBeDisabled(
	moduleId: string,
	enabledModuleIds: readonly string[],
): void {
	if (!getModule(moduleId)) {
		throw new Error(`UNKNOWN_MODULE:${moduleId}`);
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
