import { getModule } from "./catalog";
import type { ModuleManifest } from "./manifest";

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
