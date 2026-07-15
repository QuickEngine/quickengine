import type { AgentTool } from "@quickengine/agent-core";
import { z } from "zod";

const workspaceInput = z.object({ workspaceId: z.string().uuid() }).strict();

const workspaceSummary = z
	.object({
		id: z.string().uuid(),
		name: z.string().min(1),
		slug: z.string().nullable(),
		businessType: z.string().min(1),
	})
	.strict();

const workspaceModule = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		description: z.string(),
	})
	.strict();

export type QuickDashAgentRepository = {
	getWorkspace(
		workspaceId: string,
	): Promise<z.infer<typeof workspaceSummary> | null>;
	listEnabledModules(
		workspaceId: string,
	): Promise<readonly z.infer<typeof workspaceModule>[]>;
};

export function createQuickDashDiscoveryTools(
	repository: QuickDashAgentRepository,
): readonly AgentTool[] {
	const describeWorkspace: AgentTool = {
		id: "quickdash.workspace.describe",
		product: "quickdash",
		description:
			"Read basic information about one authorized QuickDash workspace.",
		risk: "read",
		approval: "never",
		inputSchema: workspaceInput,
		outputSchema: workspaceSummary,
		async execute(input, context) {
			const { workspaceId } = workspaceInput.parse(input);
			context.assertWorkspaceAccess(workspaceId, "read");
			const workspace = await repository.getWorkspace(workspaceId);
			if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
			return workspaceSummary.parse(workspace);
		},
	};

	const listModules: AgentTool = {
		id: "quickdash.modules.list",
		product: "quickdash",
		description:
			"List the enabled modules available in one authorized QuickDash workspace.",
		risk: "read",
		approval: "never",
		inputSchema: workspaceInput,
		outputSchema: z.array(workspaceModule),
		async execute(input, context) {
			const { workspaceId } = workspaceInput.parse(input);
			context.assertWorkspaceAccess(workspaceId, "read");
			return z
				.array(workspaceModule)
				.parse(await repository.listEnabledModules(workspaceId));
		},
	};

	return [describeWorkspace, listModules];
}
