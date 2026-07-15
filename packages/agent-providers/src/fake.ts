import type {
	AgentModelProvider,
	AgentModelRequest,
	AgentModelTurn,
} from "@quickengine/agent-core";

/** Deterministic provider for runtime tests and local harness development. */
export function createFakeAgentProvider(
	turns: readonly AgentModelTurn[],
): AgentModelProvider & { requests: AgentModelRequest[] } {
	const queue = [...turns];
	const requests: AgentModelRequest[] = [];
	return {
		id: "fake",
		requests,
		async complete(request) {
			requests.push(request);
			const turn = queue.shift();
			if (!turn) throw new Error("FAKE_PROVIDER_EXHAUSTED");
			return turn;
		},
	};
}

export const zeroUsage = {
	inputTokens: 0,
	outputTokens: 0,
	costMicros: 0,
} as const;
