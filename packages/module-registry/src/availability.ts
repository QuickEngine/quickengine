import type { ModuleManifest } from "./manifest";

export type ModuleAvailabilityContext = {
	workspaceId: string;
	module: ModuleManifest;
};

export type ModuleAvailabilityCheck = (
	context: ModuleAvailabilityContext,
) => boolean | Promise<boolean>;

export type ModuleMutationOptions = {
	/** Optional future rollout/plan policy. Omitted today, so every module is allowed. */
	checkAvailability?: ModuleAvailabilityCheck;
};

/** Run an injected availability policy without coupling the registry to tier names. */
export async function assertModulesAvailable(
	workspaceId: string,
	modules: readonly ModuleManifest[],
	checkAvailability?: ModuleAvailabilityCheck,
): Promise<void> {
	if (!checkAvailability) {
		return;
	}
	for (const module of modules) {
		if (!(await checkAvailability({ workspaceId, module }))) {
			throw new Error(`MODULE_NOT_AVAILABLE:${module.id}`);
		}
	}
}
