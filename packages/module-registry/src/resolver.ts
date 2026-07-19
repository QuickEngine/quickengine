import { getModule } from "./catalog";
import type { ModuleManifest } from "./manifest";

// The default modules a new workspace STARTS with — a sensible general baseline, not a
// lock. They can all be toggled off afterward (subject only to real dependency: these
// four are chained client-records ← invoicing ← payments ← fulfillment, so a lower one
// can't be removed while a higher enabled one still depends on it). The bigger question
// — per-business-type starting sets, choose-your-own, and what's free vs. paid — is a
// deliberate future pass (docs/planning/BACKLOG.md → module model & gating).
export const FOUNDATION_MODULE_IDS = [
	"client-records",
	"invoicing",
	"payments",
	"fulfillment",
] as const;

/** Resolve requested modules in dependency-first order. */
export function resolveModules(
	ids: readonly string[],
): readonly ModuleManifest[] {
	const resolved: ModuleManifest[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	function visit(id: string) {
		if (visited.has(id)) {
			return;
		}
		if (visiting.has(id)) {
			throw new Error(`MODULE_DEPENDENCY_CYCLE:${id}`);
		}

		const module = getModule(id);
		if (!module) {
			throw new Error(`UNKNOWN_MODULE:${id}`);
		}

		visiting.add(id);
		for (const dependencyId of module.dependsOn) {
			visit(dependencyId);
		}
		visiting.delete(id);
		visited.add(id);
		resolved.push(module);
	}

	for (const id of ids) {
		visit(id);
	}

	return resolved;
}

/** Every currently built foundation module, with dependencies resolved. */
export function resolveFoundationModules(): readonly ModuleManifest[] {
	return resolveModules(FOUNDATION_MODULE_IDS);
}
