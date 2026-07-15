import type { AgentTool } from "./tools";

export type AgentMessage =
	| { role: "user" | "assistant"; content: string }
	| { role: "tool"; toolCallId: string; content: string };

export type AgentToolCall = {
	id: string;
	toolId: string;
	input: unknown;
};

export type AgentModelTurn = {
	content: string;
	toolCalls: readonly AgentToolCall[];
	usage: {
		inputTokens: number;
		outputTokens: number;
		costMicros: number;
	};
};

export type AgentModelRequest = {
	runId: string;
	messages: readonly AgentMessage[];
	tools: readonly Pick<AgentTool, "id" | "description" | "inputSchema">[];
	maxOutputTokens: number;
	signal: AbortSignal;
};

export type AgentModelProvider = {
	id: string;
	complete(request: AgentModelRequest): Promise<AgentModelTurn>;
};
