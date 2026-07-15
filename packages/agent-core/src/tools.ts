import type { ZodType } from "zod";
import type { AgentRunScope, WorkspaceAccess } from "./scope";

export type AgentToolRisk =
	| "read"
	| "write"
	| "external_message"
	| "financial"
	| "destructive"
	| "permissions"
	| "publishing";

export type AgentToolApproval = "never" | "always" | "risk_based";

export type AgentToolExecutionContext = {
	runId: string;
	scope: AgentRunScope;
	signal: AbortSignal;
	assertWorkspaceAccess: (
		workspaceId: string,
		required: WorkspaceAccess,
	) => void;
};

export type AgentTool<TInput = unknown, TOutput = unknown> = {
	id: string;
	product: string;
	description: string;
	risk: AgentToolRisk;
	approval: AgentToolApproval;
	inputSchema: ZodType<TInput>;
	outputSchema: ZodType<TOutput>;
	execute: (
		input: TInput,
		context: AgentToolExecutionContext,
	) => Promise<TOutput>;
};

const SENSITIVE_RISKS = new Set<AgentToolRisk>([
	"external_message",
	"financial",
	"destructive",
	"permissions",
	"publishing",
]);

export function toolRequiresApproval(tool: AgentTool): boolean {
	if (tool.approval === "always") return true;
	if (tool.approval === "never") return false;
	return SENSITIVE_RISKS.has(tool.risk);
}

export function createToolRegistry(tools: readonly AgentTool[]) {
	const registry = new Map<string, AgentTool>();
	for (const tool of tools) {
		if (!tool.id.trim() || registry.has(tool.id)) {
			throw new Error(`INVALID_OR_DUPLICATE_AGENT_TOOL:${tool.id}`);
		}
		registry.set(tool.id, tool);
	}
	return registry;
}
