import type { FirstActionChecklistItem } from "../_lib/first-action-checklist";

export type WorkspaceHomeAction = {
	id: string;
	label: string;
	description: string;
	href: string;
};

export type WorkspaceHomeModel = {
	nextAction: WorkspaceHomeAction | null;
	quickActions: readonly WorkspaceHomeAction[];
	completedRequiredSteps: number;
	totalRequiredSteps: number;
};

/**
 * Derive Home from the same real-state guidance used by Getting started.
 *
 * This deliberately does not infer urgency, revenue, due dates or record counts. Those become
 * Home sections only when their owning modules expose an explicit operational summary contract.
 */
export function buildWorkspaceHomeModel(
	items: readonly FirstActionChecklistItem[],
): WorkspaceHomeModel {
	const requiredSteps = items.flatMap((item) =>
		item.steps.filter((step) => !step.optional),
	);
	const incompleteSteps = requiredSteps.filter((step) => !step.completed);
	const nextStep =
		incompleteSteps.find((step) => step.isNext) ?? incompleteSteps[0] ?? null;
	const quickActions = items
		.map((item) => item.steps.find((step) => !step.completed && !step.optional))
		.filter((step): step is NonNullable<typeof step> => Boolean(step))
		.filter((step) => step.id !== nextStep?.id)
		.slice(0, 4);

	const toAction = (
		step: (typeof requiredSteps)[number],
	): WorkspaceHomeAction => ({
		id: step.id,
		label: step.label,
		description: step.description,
		href: step.href,
	});

	return {
		nextAction: nextStep ? toAction(nextStep) : null,
		quickActions: quickActions.map(toAction),
		completedRequiredSteps: requiredSteps.filter((step) => step.completed)
			.length,
		totalRequiredSteps: requiredSteps.length,
	};
}
