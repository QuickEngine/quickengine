import type {
	AgentAuditEvent,
	AgentAuditSink,
	AgentBudget,
	AgentModelTurn,
	AgentRunScope,
	AgentTool,
} from "@quickengine/agent-core";
import {
	createFakeAgentProvider,
	zeroUsage,
} from "@quickengine/agent-providers";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runAgent } from "./runtime";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";

const scope: AgentRunScope = {
	actorId: "user-1",
	organizationId: "org-1",
	allowedProducts: ["quickdash"],
	workspaceGrants: [{ workspaceId: WORKSPACE_ID, access: "write" }],
};

const budget: AgentBudget = {
	maxSteps: 4,
	maxInputTokens: 1_000,
	maxOutputTokens: 1_000,
	maxCostMicros: 1_000_000,
	maxDurationMs: 60_000,
};

function memoryAudit(): AgentAuditSink & { events: AgentAuditEvent[] } {
	const events: AgentAuditEvent[] = [];
	return {
		events,
		async record(event) {
			events.push(event);
		},
	};
}

function turn(value: Partial<AgentModelTurn>): AgentModelTurn {
	return { content: "", toolCalls: [], usage: zeroUsage, ...value };
}

function readTool(execute = vi.fn(async () => ({ ok: true }))): AgentTool {
	return {
		id: "quickdash.test.read",
		product: "quickdash",
		description: "Read test data.",
		risk: "read",
		approval: "never",
		inputSchema: z.object({ workspaceId: z.string().uuid() }).strict(),
		outputSchema: z.object({ ok: z.boolean() }).strict(),
		async execute(input, context) {
			const value = input as { workspaceId: string };
			context.assertWorkspaceAccess(value.workspaceId, "read");
			return execute();
		},
	};
}

describe("agent runtime", () => {
	it("executes an authorized typed tool and completes", async () => {
		const execute = vi.fn(async () => ({ ok: true }));
		const provider = createFakeAgentProvider([
			turn({
				toolCalls: [
					{
						id: "call-1",
						toolId: "quickdash.test.read",
						input: { workspaceId: WORKSPACE_ID },
					},
				],
			}),
			turn({ content: "Finished" }),
		]);
		const audit = memoryAudit();
		const result = await runAgent({
			runId: "run-1",
			prompt: "Test",
			scope,
			budget,
			provider,
			tools: [readTool(execute)],
			audit,
		});
		expect(result.status).toBe("completed");
		expect(execute).toHaveBeenCalledOnce();
		expect(audit.events.map((event) => event.type)).toContain("tool.completed");
	});

	it("denies a cross-workspace tool request", async () => {
		const provider = createFakeAgentProvider([
			turn({
				toolCalls: [
					{
						id: "call-1",
						toolId: "quickdash.test.read",
						input: { workspaceId: OTHER_WORKSPACE_ID },
					},
				],
			}),
		]);
		const result = await runAgent({
			runId: "run-2",
			prompt: "Test",
			scope,
			budget,
			provider,
			tools: [readTool()],
			audit: memoryAudit(),
		});
		expect(result).toMatchObject({
			status: "failed",
			reason: `WORKSPACE_READ_DENIED:${OTHER_WORKSPACE_ID}`,
		});
	});

	it("rejects unknown tools and invalid inputs", async () => {
		const unknown = await runAgent({
			runId: "run-3",
			prompt: "Test",
			scope,
			budget,
			provider: createFakeAgentProvider([
				turn({ toolCalls: [{ id: "call-1", toolId: "missing", input: {} }] }),
			]),
			tools: [readTool()],
			audit: memoryAudit(),
		});
		expect(unknown).toMatchObject({
			status: "failed",
			reason: "UNKNOWN_AGENT_TOOL:missing",
		});

		const invalid = await runAgent({
			runId: "run-4",
			prompt: "Test",
			scope,
			budget,
			provider: createFakeAgentProvider([
				turn({
					toolCalls: [
						{
							id: "call-1",
							toolId: "quickdash.test.read",
							input: { workspaceId: "not-a-uuid" },
						},
					],
				}),
			]),
			tools: [readTool()],
			audit: memoryAudit(),
		});
		expect(invalid).toMatchObject({
			status: "failed",
			reason: "INVALID_AGENT_TOOL_INPUT:quickdash.test.read",
		});
	});

	it("pauses sensitive tools before executing them", async () => {
		const execute = vi.fn(async () => ({ ok: true }));
		const tool = {
			...readTool(execute),
			id: "quickdash.invoice.send",
			risk: "external_message",
			approval: "risk_based",
		} satisfies AgentTool;
		const result = await runAgent({
			runId: "run-5",
			prompt: "Send it",
			scope,
			budget,
			provider: createFakeAgentProvider([
				turn({
					toolCalls: [
						{
							id: "call-1",
							toolId: tool.id,
							input: { workspaceId: WORKSPACE_ID },
						},
					],
				}),
			]),
			tools: [tool],
			audit: memoryAudit(),
		});
		expect(result).toMatchObject({
			status: "awaiting_approval",
			tool: { id: tool.id, risk: "external_message" },
		});
		expect(execute).not.toHaveBeenCalled();
	});

	it("stops on token budgets and cancellation", async () => {
		const overBudget = await runAgent({
			runId: "run-6",
			prompt: "Test",
			scope,
			budget: { ...budget, maxOutputTokens: 1 },
			provider: createFakeAgentProvider([
				turn({ content: "Too much", usage: { ...zeroUsage, outputTokens: 2 } }),
			]),
			tools: [],
			audit: memoryAudit(),
		});
		expect(overBudget).toMatchObject({
			status: "budget_exceeded",
			reason: "output_tokens",
		});

		const controller = new AbortController();
		controller.abort();
		const cancelled = await runAgent({
			runId: "run-7",
			prompt: "Test",
			scope,
			budget,
			provider: createFakeAgentProvider([]),
			tools: [],
			audit: memoryAudit(),
			signal: controller.signal,
		});
		expect(cancelled).toMatchObject({ status: "cancelled" });
	});

	it("aborts a cooperative provider when the duration budget expires", async () => {
		const result = await runAgent({
			runId: "run-8",
			prompt: "Test",
			scope,
			budget: { ...budget, maxDurationMs: 5 },
			provider: {
				id: "slow",
				complete: (request) =>
					new Promise((_resolve, reject) => {
						request.signal.addEventListener(
							"abort",
							() => reject(new Error("PROVIDER_ABORTED")),
							{ once: true },
						);
					}),
			},
			tools: [],
			audit: memoryAudit(),
		});
		expect(result).toMatchObject({
			status: "budget_exceeded",
			reason: "duration",
		});
	});
});
