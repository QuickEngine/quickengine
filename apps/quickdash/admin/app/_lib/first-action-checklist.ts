import type { SupplementalGuidedGoalDescriptor } from "@quickengine/module-registry";
import type { ResolvedGuidedAction } from "./guided-action-resolution";

export type FirstActionChecklistStep = {
	id: string;
	label: string;
	description: string;
	href: string;
	completed: boolean;
	optional: boolean;
	isNext: boolean;
};

export type FirstActionChecklistItem = {
	id: string;
	label: string;
	description: string;
	completed: boolean;
	steps: readonly FirstActionChecklistStep[];
};

export function isFirstActionChecklistComplete(
	items: readonly {
		steps: readonly Pick<FirstActionChecklistStep, "completed" | "optional">[];
	}[],
) {
	const required = items
		.flatMap((item) => item.steps)
		.filter((step) => !step.optional);
	return required.length > 0 && required.every((step) => step.completed);
}

export function resolveInitialFirstActionChecklistCollapsed(input: {
	hasStoredState: boolean;
	storedCollapsed: boolean;
}) {
	return input.hasStoredState ? input.storedCollapsed : true;
}

export function buildFirstActionChecklistItems(
	workspaceId: string,
	goals: readonly ResolvedGuidedAction[],
	nextStepId: string | null,
	supplemental?: { goal: SupplementalGuidedGoalDescriptor; href: string },
): readonly FirstActionChecklistItem[] {
	const businessItems = goals.map((goal) => ({
		id: goal.id,
		label: goal.label,
		description: goal.description,
		completed: goal.completed,
		steps: goal.steps.map((step) => ({
			id: step.id,
			label: step.label,
			description: step.description,
			href: `/${workspaceId}/${goal.moduleId}?intent=${encodeURIComponent(step.intent)}`,
			completed: step.completed,
			optional: step.optional ?? false,
			isNext: step.id === nextStepId,
		})),
	}));
	if (!supplemental) return businessItems;
	return [
		...businessItems,
		{
			id: supplemental.goal.id,
			label: supplemental.goal.label,
			description: supplemental.goal.description,
			completed: false,
			steps: supplemental.goal.steps.map((step) => ({
				id: step.id,
				label: step.label,
				description: step.description,
				href: supplemental.href,
				completed: false,
				optional: true,
				isNext: false,
			})),
		},
	];
}
