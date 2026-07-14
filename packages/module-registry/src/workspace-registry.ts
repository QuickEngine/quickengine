import {
	and,
	db,
	eq,
	quickengineWorkspaces,
	workspaceModules,
} from "@quickengine/db";
import {
	assertModulesAvailable,
	type ModuleMutationOptions,
} from "./availability";
import { getModule } from "./catalog";
import { planModulesEnablement } from "./enablement";
import {
	assertModuleCanBeDisabled,
	mergeModuleSettings,
	parseModuleSettings,
} from "./policy";
import { FOUNDATION_MODULE_IDS, resolveModules } from "./resolver";

export type WorkspaceModuleConfiguration = {
	id: string;
	name: string;
	description: string;
	kind: "shared" | "domain";
	enabled: boolean;
	settings: Record<string, unknown>;
};

/** Read the canonical module configuration for one workspace. */
export async function getWorkspaceModules(
	workspaceId: string,
): Promise<readonly WorkspaceModuleConfiguration[]> {
	const [workspace] = await db
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(eq(quickengineWorkspaces.id, workspaceId))
		.limit(1);
	if (!workspace) {
		throw new Error("WORKSPACE_NOT_FOUND");
	}

	const rows = await db
		.select()
		.from(workspaceModules)
		.where(eq(workspaceModules.workspaceId, workspaceId));

	return rows.map((row) => {
		const module = getModule(row.moduleId);
		if (!module) {
			throw new Error(`UNKNOWN_STORED_MODULE:${row.moduleId}`);
		}
		return {
			id: module.id,
			name: module.name,
			description: module.description,
			kind: module.kind,
			enabled: row.enabled,
			settings: parseModuleSettings(module.id, row.settings),
		};
	});
}

/**
 * Enable a module and every missing dependency in one transaction. Safe to repeat:
 * existing enabled rows are untouched and re-enabled rows preserve their settings.
 */
export async function enableWorkspaceModule(
	workspaceId: string,
	moduleId: string,
	options: ModuleMutationOptions = {},
): Promise<readonly WorkspaceModuleConfiguration[]> {
	return enableWorkspaceModules(workspaceId, [moduleId], options);
}

async function enableWorkspaceModules(
	workspaceId: string,
	moduleIds: readonly string[],
	options: ModuleMutationOptions,
): Promise<readonly WorkspaceModuleConfiguration[]> {
	const requested = resolveModules(moduleIds);
	const foundationIds = new Set<string>(FOUNDATION_MODULE_IDS);
	await assertModulesAvailable(
		workspaceId,
		requested.filter((module) => !foundationIds.has(module.id)),
		options.checkAvailability,
	);

	await db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1)
			.for("update");
		if (!workspace) {
			throw new Error("WORKSPACE_NOT_FOUND");
		}

		const stored = await tx
			.select({
				moduleId: workspaceModules.moduleId,
				enabled: workspaceModules.enabled,
				settings: workspaceModules.settings,
			})
			.from(workspaceModules)
			.where(eq(workspaceModules.workspaceId, workspaceId));
		const plan = planModulesEnablement(moduleIds, stored);

		for (const item of plan) {
			if (item.isNew) {
				await tx.insert(workspaceModules).values({
					workspaceId,
					moduleId: item.moduleId,
					enabled: true,
					settings: item.settings,
				});
			} else {
				await tx
					.update(workspaceModules)
					.set({ enabled: true, updatedAt: new Date() })
					.where(
						and(
							eq(workspaceModules.workspaceId, workspaceId),
							eq(workspaceModules.moduleId, item.moduleId),
						),
					);
			}
		}

		const enabledIds = new Set(
			stored.filter((row) => row.enabled).map((row) => row.moduleId),
		);
		for (const item of plan) {
			enabledIds.add(item.moduleId);
		}
		const canonicalIds = resolveModules([...enabledIds]).map(
			(module) => module.id,
		);
		await tx
			.update(quickengineWorkspaces)
			.set({ modules: canonicalIds, updatedAt: new Date() })
			.where(eq(quickengineWorkspaces.id, workspaceId));
	});

	return getWorkspaceModules(workspaceId);
}

export type WorkspaceRecipe = {
	id: string;
	moduleIds: readonly string[];
};

/**
 * Apply a recipe as a starting point. It always includes the permanent foundation
 * and never removes modules a workspace already chose independently.
 */
export async function applyWorkspaceRecipe(
	workspaceId: string,
	recipe: WorkspaceRecipe,
	options: ModuleMutationOptions = {},
): Promise<readonly WorkspaceModuleConfiguration[]> {
	if (!recipe.id.trim()) {
		throw new Error("RECIPE_ID_REQUIRED");
	}
	return enableWorkspaceModules(
		workspaceId,
		[...FOUNDATION_MODULE_IDS, ...recipe.moduleIds],
		options,
	);
}

/**
 * Disable an optional module without deleting its settings. Foundation modules and
 * modules required by another enabled module are rejected before the write.
 */
export async function disableWorkspaceModule(
	workspaceId: string,
	moduleId: string,
): Promise<readonly WorkspaceModuleConfiguration[]> {
	await db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1)
			.for("update");
		if (!workspace) {
			throw new Error("WORKSPACE_NOT_FOUND");
		}

		const stored = await tx
			.select({
				moduleId: workspaceModules.moduleId,
				enabled: workspaceModules.enabled,
				settings: workspaceModules.settings,
			})
			.from(workspaceModules)
			.where(eq(workspaceModules.workspaceId, workspaceId));
		const target = stored.find((row) => row.moduleId === moduleId);
		if (!target) {
			throw new Error(`MODULE_NOT_CONFIGURED:${moduleId}`);
		}

		const enabledIds = stored
			.filter((row) => row.enabled)
			.map((row) => row.moduleId);
		assertModuleCanBeDisabled(moduleId, enabledIds);

		if (target.enabled) {
			await tx
				.update(workspaceModules)
				.set({ enabled: false, updatedAt: new Date() })
				.where(
					and(
						eq(workspaceModules.workspaceId, workspaceId),
						eq(workspaceModules.moduleId, moduleId),
					),
				);
		}

		const remainingIds = enabledIds.filter((id) => id !== moduleId);
		const canonicalIds = resolveModules(remainingIds).map(
			(module) => module.id,
		);
		await tx
			.update(quickengineWorkspaces)
			.set({ modules: canonicalIds, updatedAt: new Date() })
			.where(eq(quickengineWorkspaces.id, workspaceId));
	});

	return getWorkspaceModules(workspaceId);
}

/**
 * Validate and update one configured module's settings. This never changes the
 * module's enabled state, so disabled modules can be prepared before re-enablement.
 */
export async function updateWorkspaceModuleSettings(
	workspaceId: string,
	moduleId: string,
	patch: Record<string, unknown>,
): Promise<WorkspaceModuleConfiguration> {
	return db.transaction(async (tx) => {
		const [workspace] = await tx
			.select({ id: quickengineWorkspaces.id })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, workspaceId))
			.limit(1);
		if (!workspace) {
			throw new Error("WORKSPACE_NOT_FOUND");
		}

		// Lock the row so simultaneous patches merge against the latest saved values.
		const [stored] = await tx
			.select()
			.from(workspaceModules)
			.where(
				and(
					eq(workspaceModules.workspaceId, workspaceId),
					eq(workspaceModules.moduleId, moduleId),
				),
			)
			.limit(1)
			.for("update");
		if (!stored) {
			throw new Error(`MODULE_NOT_CONFIGURED:${moduleId}`);
		}

		const settings = mergeModuleSettings(moduleId, stored.settings, patch);
		const [updated] = await tx
			.update(workspaceModules)
			.set({ settings, updatedAt: new Date() })
			.where(eq(workspaceModules.id, stored.id))
			.returning();
		if (!updated) {
			throw new Error(`MODULE_SETTINGS_UPDATE_FAILED:${moduleId}`);
		}

		const module = getModule(moduleId);
		if (!module) {
			throw new Error(`UNKNOWN_STORED_MODULE:${moduleId}`);
		}
		return {
			id: module.id,
			name: module.name,
			description: module.description,
			kind: module.kind,
			enabled: updated.enabled,
			settings,
		};
	});
}
