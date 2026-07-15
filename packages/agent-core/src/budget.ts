export type AgentBudget = {
	maxSteps: number;
	maxInputTokens: number;
	maxOutputTokens: number;
	maxCostMicros: number;
	maxDurationMs: number;
};

export type AgentUsage = {
	steps: number;
	inputTokens: number;
	outputTokens: number;
	costMicros: number;
};

export const EMPTY_AGENT_USAGE: AgentUsage = {
	steps: 0,
	inputTokens: 0,
	outputTokens: 0,
	costMicros: 0,
};

export function assertBudgetShape(budget: AgentBudget): void {
	for (const [name, value] of Object.entries(budget)) {
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new Error(`INVALID_AGENT_BUDGET:${name}`);
		}
	}
}

export function budgetExceeded(
	usage: AgentUsage,
	budget: AgentBudget,
	elapsedMs: number,
): string | null {
	if (usage.steps >= budget.maxSteps) return "steps";
	if (usage.inputTokens > budget.maxInputTokens) return "input_tokens";
	if (usage.outputTokens > budget.maxOutputTokens) return "output_tokens";
	if (usage.costMicros > budget.maxCostMicros) return "cost";
	if (elapsedMs > budget.maxDurationMs) return "duration";
	return null;
}
