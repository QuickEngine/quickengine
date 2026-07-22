export type GuidedActionStepDescriptor = {
	/** Stable identity nested below its owning first action. */
	id: `${string}:${string}:${string}`;
	version: 1;
	label: string;
	description: string;
	/** Intent interpreted by the owning module page in the later execution slice. */
	intent: string;
	/** Optional steps never prevent the parent business goal from completing. */
	optional?: boolean;
};

export type FirstActionDescriptor = {
	/** Stable, namespaced identity such as `client-records:create`. */
	id: `${string}:${string}`;
	/** Increment only when the meaning/completion contract changes. */
	version: 1;
	label: string;
	description: string;
	/** Module page to open. Must match the manifest that owns this descriptor. */
	moduleId: string;
	/** Optional intent interpreted by that module page, initially `create` or `configure`. */
	intent?: string;
	/** Lower values appear earlier when no recipe preference overrides them. */
	priority: number;
	/** Other first actions that must be possible and ordered before this one. */
	requires?: readonly FirstActionDescriptor["id"][];
	/** Ordered, real-state milestones that explain how to complete this parent goal. */
	steps: readonly GuidedActionStepDescriptor[];
};

export type ResolvedFirstAction = FirstActionDescriptor & {
	moduleName: string;
};

type FirstActionManifest = {
	id: string;
	name: string;
	firstActions?: readonly FirstActionDescriptor[];
};

export type ResolveFirstActionsInput = {
	manifests: readonly FirstActionManifest[];
	enabledModuleIds: readonly string[];
	/** Recipe ordering hint. Unknown/unavailable ids are ignored. */
	preferredActionIds?: readonly FirstActionDescriptor["id"][];
	maxActions?: number;
};

/**
 * Build one deterministic, dependency-safe checklist from the modules actually enabled in
 * a workspace. It does not infer completion and never repairs module dependencies; the
 * workspace registry has already resolved that harder structural graph.
 */
export function resolveFirstActions(
	input: ResolveFirstActionsInput,
): readonly ResolvedFirstAction[] {
	const limit = input.maxActions ?? 5;
	if (!Number.isSafeInteger(limit) || limit < 1) {
		throw new Error("INVALID_FIRST_ACTION_LIMIT");
	}
	const enabled = new Set(input.enabledModuleIds);
	const actions = new Map<FirstActionDescriptor["id"], ResolvedFirstAction>();
	let sequence = 0;
	const declarationOrder = new Map<FirstActionDescriptor["id"], number>();

	for (const manifest of input.manifests) {
		if (!enabled.has(manifest.id)) continue;
		for (const action of manifest.firstActions ?? []) {
			if (action.moduleId !== manifest.id) {
				throw new Error(`FIRST_ACTION_OWNER_MISMATCH:${action.id}`);
			}
			if (actions.has(action.id)) {
				throw new Error(`DUPLICATE_FIRST_ACTION:${action.id}`);
			}
			actions.set(action.id, { ...action, moduleName: manifest.name });
			declarationOrder.set(action.id, sequence++);
		}
	}

	// If an action requires something unavailable in the enabled set, it cannot honestly be
	// offered. Remove it and anything that transitively relies on it.
	const isEligible = (
		id: FirstActionDescriptor["id"],
		visiting = new Set<FirstActionDescriptor["id"]>(),
	): boolean => {
		const action = actions.get(id);
		if (!action) return false;
		if (visiting.has(id)) throw new Error(`FIRST_ACTION_CYCLE:${id}`);
		visiting.add(id);
		const eligible = (action.requires ?? []).every((required) =>
			isEligible(required, new Set(visiting)),
		);
		return eligible;
	};

	const availableIds = [...actions.keys()].filter((id) => isEligible(id));
	const preferredOrder = new Map(
		(input.preferredActionIds ?? []).map((id, index) => [id, index]),
	);
	availableIds.sort((leftId, rightId) => {
		const leftPreferred = preferredOrder.get(leftId);
		const rightPreferred = preferredOrder.get(rightId);
		if (leftPreferred !== undefined || rightPreferred !== undefined) {
			if (leftPreferred === undefined) return 1;
			if (rightPreferred === undefined) return -1;
			return leftPreferred - rightPreferred;
		}
		const left = actions.get(leftId);
		const right = actions.get(rightId);
		if (!left || !right) return 0;
		return (
			left.priority - right.priority ||
			(declarationOrder.get(leftId) ?? 0) - (declarationOrder.get(rightId) ?? 0)
		);
	});

	const resolved: ResolvedFirstAction[] = [];
	const added = new Set<FirstActionDescriptor["id"]>();
	const append = (
		id: FirstActionDescriptor["id"],
		visiting = new Set<string>(),
	) => {
		if (added.has(id) || resolved.length >= limit) return;
		if (visiting.has(id)) throw new Error(`FIRST_ACTION_CYCLE:${id}`);
		const action = actions.get(id);
		if (!action || !isEligible(id)) return;
		visiting.add(id);
		for (const required of action.requires ?? [])
			append(required, new Set(visiting));
		if (resolved.length >= limit || added.has(id)) return;
		resolved.push(action);
		added.add(id);
	};
	for (const id of availableIds) append(id);
	return resolved;
}
