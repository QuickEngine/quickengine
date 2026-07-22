import type { ResolvedFirstAction } from "@quickengine/module-registry";

export type GuidedActionStepCompletion = { id: string; completed: boolean };

export type ResolvedGuidedAction = ResolvedFirstAction & {
	completed: boolean;
	steps: readonly (ResolvedFirstAction["steps"][number] & {
		completed: boolean;
	})[];
};

export type GuidedActionResolution = {
	goals: readonly ResolvedGuidedAction[];
	nextStep: ResolvedGuidedAction["steps"][number] | null;
};

export function resolveGuidedActions(
	actions: readonly ResolvedFirstAction[],
	completions: readonly GuidedActionStepCompletion[],
): GuidedActionResolution {
	const completedById = new Map(
		completions.map((item) => [item.id, item.completed]),
	);
	const seen = new Set<string>();
	const goals = actions.map((action): ResolvedGuidedAction => {
		const steps = action.steps.map((step) => {
			if (seen.has(step.id))
				throw new Error(`DUPLICATE_GUIDED_STEP:${step.id}`);
			seen.add(step.id);
			return { ...step, completed: completedById.get(step.id) ?? false };
		});
		return {
			...action,
			steps,
			completed: steps
				.filter((step) => !step.optional)
				.every((step) => step.completed),
		};
	});
	const nextStep =
		goals
			.flatMap((goal) => goal.steps)
			.find((step) => !step.optional && !step.completed) ?? null;
	return { goals, nextStep };
}
