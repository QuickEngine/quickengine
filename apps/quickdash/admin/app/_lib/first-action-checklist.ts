import type { ResolvedFirstAction } from "@quickengine/module-registry";
import type { FirstActionCompletion } from "./first-action-completion";

export type FirstActionChecklistItem = {
	id: string;
	label: string;
	description: string;
	moduleName: string;
	href: string;
	completed: boolean;
};

export function buildFirstActionChecklistItems(
	workspaceId: string,
	actions: readonly ResolvedFirstAction[],
	completions: readonly FirstActionCompletion[],
): readonly FirstActionChecklistItem[] {
	const completedById = new Map(
		completions.map((completion): readonly [string, boolean] => [
			completion.id,
			completion.completed,
		]),
	);
	return actions.map((action) => ({
		id: action.id,
		label: action.label,
		description: action.description,
		moduleName: action.moduleName,
		href: `/${workspaceId}/${action.moduleId}?intent=${encodeURIComponent(action.intent ?? "open")}`,
		completed: completedById.get(action.id) ?? false,
	}));
}
