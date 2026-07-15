import {
	type AgentAuditEvent,
	type AgentAuditSink,
	type AgentBudget,
	type AgentMessage,
	type AgentModelProvider,
	type AgentRunScope,
	type AgentTool,
	type AgentToolCall,
	type AgentUsage,
	assertBudgetShape,
	assertProductAccess,
	assertWorkspaceAccess,
	budgetExceeded,
	createToolRegistry,
	EMPTY_AGENT_USAGE,
	toolRequiresApproval,
} from "@quickengine/agent-core";

export type AgentRunInput = {
	runId: string;
	prompt: string;
	scope: AgentRunScope;
	budget: AgentBudget;
	provider: AgentModelProvider;
	tools: readonly AgentTool[];
	audit: AgentAuditSink;
	signal?: AbortSignal;
	now?: () => number;
};

export type AgentRunResult =
	| {
			status: "completed";
			content: string;
			usage: AgentUsage;
	  }
	| {
			status: "awaiting_approval";
			toolCall: AgentToolCall;
			tool: Pick<AgentTool, "id" | "description" | "product" | "risk">;
			usage: AgentUsage;
	  }
	| {
			status: "cancelled" | "failed" | "budget_exceeded";
			reason: string;
			usage: AgentUsage;
	  };

function validUsage(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}

function copyUsage(usage: AgentUsage): AgentUsage {
	return { ...usage };
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
	assertBudgetShape(input.budget);
	if (!input.runId.trim() || !input.prompt.trim()) {
		throw new Error("AGENT_RUN_ID_AND_PROMPT_REQUIRED");
	}
	const tools = createToolRegistry(input.tools);
	const controller = new AbortController();
	let durationExceeded = false;
	const cancelFromCaller = () => controller.abort();
	input.signal?.addEventListener("abort", cancelFromCaller, { once: true });
	if (input.signal?.aborted) controller.abort();
	const durationTimer = setTimeout(() => {
		durationExceeded = true;
		controller.abort();
	}, input.budget.maxDurationMs);
	const signal = controller.signal;
	const now = input.now ?? Date.now;
	const startedAt = now();
	const usage = copyUsage(EMPTY_AGENT_USAGE);
	const messages: AgentMessage[] = [{ role: "user", content: input.prompt }];

	const audit = async (
		type: AgentAuditEvent["type"],
		details: Record<string, unknown> = {},
	) =>
		input.audit.record({
			runId: input.runId,
			at: new Date(now()),
			type,
			details,
			usage: copyUsage(usage),
		});

	await audit("run.started", {
		actorId: input.scope.actorId,
		organizationId: input.scope.organizationId,
		providerId: input.provider.id,
	});

	try {
		while (true) {
			if (signal.aborted) {
				if (durationExceeded) {
					await audit("budget.exceeded", { dimension: "duration" });
					return {
						status: "budget_exceeded",
						reason: "duration",
						usage,
					};
				}
				await audit("run.cancelled");
				return { status: "cancelled", reason: "cancelled", usage };
			}
			const exceededBefore = budgetExceeded(
				usage,
				input.budget,
				now() - startedAt,
			);
			if (exceededBefore) {
				await audit("budget.exceeded", { dimension: exceededBefore });
				return {
					status: "budget_exceeded",
					reason: exceededBefore,
					usage,
				};
			}

			const turn = await input.provider.complete({
				runId: input.runId,
				messages,
				tools: input.tools.map(({ id, description, inputSchema }) => ({
					id,
					description,
					inputSchema,
				})),
				maxOutputTokens: Math.max(
					1,
					input.budget.maxOutputTokens - usage.outputTokens,
				),
				signal,
			});
			if (
				!validUsage(turn.usage.inputTokens) ||
				!validUsage(turn.usage.outputTokens) ||
				!validUsage(turn.usage.costMicros) ||
				turn.toolCalls.length > 8
			) {
				throw new Error("INVALID_PROVIDER_RESPONSE");
			}
			usage.steps += 1;
			usage.inputTokens += turn.usage.inputTokens;
			usage.outputTokens += turn.usage.outputTokens;
			usage.costMicros += turn.usage.costMicros;
			await audit("model.completed", {
				providerId: input.provider.id,
				toolCallCount: turn.toolCalls.length,
			});

			const exceededAfter = budgetExceeded(
				{ ...usage, steps: usage.steps - 1 },
				input.budget,
				now() - startedAt,
			);
			if (exceededAfter) {
				await audit("budget.exceeded", { dimension: exceededAfter });
				return {
					status: "budget_exceeded",
					reason: exceededAfter,
					usage,
				};
			}

			messages.push({ role: "assistant", content: turn.content });
			if (turn.toolCalls.length === 0) {
				await audit("run.completed");
				return { status: "completed", content: turn.content, usage };
			}

			for (const toolCall of turn.toolCalls) {
				if (!toolCall.id.trim()) throw new Error("INVALID_TOOL_CALL_ID");
				const tool = tools.get(toolCall.toolId);
				if (!tool) throw new Error(`UNKNOWN_AGENT_TOOL:${toolCall.toolId}`);
				assertProductAccess(input.scope, tool.product);
				const parsedInput = tool.inputSchema.safeParse(toolCall.input);
				if (!parsedInput.success) {
					throw new Error(`INVALID_AGENT_TOOL_INPUT:${tool.id}`);
				}
				await audit("tool.requested", {
					toolCallId: toolCall.id,
					toolId: tool.id,
					risk: tool.risk,
				});
				if (toolRequiresApproval(tool)) {
					await audit("approval.required", {
						toolCallId: toolCall.id,
						toolId: tool.id,
						risk: tool.risk,
					});
					return {
						status: "awaiting_approval",
						toolCall,
						tool: {
							id: tool.id,
							description: tool.description,
							product: tool.product,
							risk: tool.risk,
						},
						usage,
					};
				}

				const output = await tool.execute(parsedInput.data, {
					runId: input.runId,
					scope: input.scope,
					signal,
					assertWorkspaceAccess: (workspaceId, required) =>
						assertWorkspaceAccess(input.scope, workspaceId, required),
				});
				const parsedOutput = tool.outputSchema.safeParse(output);
				if (!parsedOutput.success) {
					throw new Error(`INVALID_AGENT_TOOL_OUTPUT:${tool.id}`);
				}
				messages.push({
					role: "tool",
					toolCallId: toolCall.id,
					content: JSON.stringify(parsedOutput.data),
				});
				await audit("tool.completed", {
					toolCallId: toolCall.id,
					toolId: tool.id,
				});
			}
		}
	} catch (error) {
		const reason =
			error instanceof Error ? error.message : "UNKNOWN_AGENT_ERROR";
		if (durationExceeded) {
			await audit("budget.exceeded", { dimension: "duration" });
			return { status: "budget_exceeded", reason: "duration", usage };
		}
		await audit(signal.aborted ? "run.cancelled" : "run.failed", { reason });
		return {
			status: signal.aborted ? "cancelled" : "failed",
			reason,
			usage,
		};
	} finally {
		clearTimeout(durationTimer);
		input.signal?.removeEventListener("abort", cancelFromCaller);
	}
}
