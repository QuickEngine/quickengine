import type { AgentRunScope } from "@quickengine/agent-core";
import { describe, expect, it, vi } from "vitest";
import { createQuickDashDiscoveryTools } from "./tools";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

const scope: AgentRunScope = {
	actorId: "user-1",
	organizationId: "org-1",
	allowedProducts: ["quickdash"],
	workspaceGrants: [{ workspaceId: WORKSPACE_ID, access: "read" }],
};

describe("QuickDash agent discovery tools", () => {
	it("reauthorizes the workspace before reading its repository", async () => {
		const getWorkspace = vi.fn();
		const [tool] = createQuickDashDiscoveryTools({
			getWorkspace,
			listEnabledModules: vi.fn(),
		});
		if (!tool) throw new Error("TOOL_MISSING");
		await expect(
			tool.execute(
				{ workspaceId: WORKSPACE_ID },
				{
					runId: "run-1",
					scope,
					signal: new AbortController().signal,
					assertWorkspaceAccess() {
						throw new Error("WORKSPACE_READ_DENIED");
					},
				},
			),
		).rejects.toThrow("WORKSPACE_READ_DENIED");
		expect(getWorkspace).not.toHaveBeenCalled();
	});

	it("returns only the repository's enabled module projection", async () => {
		const tools = createQuickDashDiscoveryTools({
			getWorkspace: vi.fn(),
			listEnabledModules: vi.fn(async () => [
				{
					id: "client-records",
					name: "Client Records",
					description: "Clients",
				},
			]),
		});
		const tool = tools.find((item) => item.id === "quickdash.modules.list");
		if (!tool) throw new Error("TOOL_MISSING");
		const output = await tool.execute(
			{ workspaceId: WORKSPACE_ID },
			{
				runId: "run-2",
				scope,
				signal: new AbortController().signal,
				assertWorkspaceAccess: vi.fn(),
			},
		);
		expect(output).toEqual([
			{ id: "client-records", name: "Client Records", description: "Clients" },
		]);
	});
});
