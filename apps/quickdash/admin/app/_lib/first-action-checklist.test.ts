import { describe, expect, it } from "vitest";
import {
	buildFirstActionChecklistItems,
	isFirstActionChecklistComplete,
	resolveInitialFirstActionChecklistCollapsed,
} from "./first-action-checklist";

const actions = [
	{
		id: "client-records:create" as const,
		version: 1 as const,
		label: "Add your first client",
		description: "Create the first client record.",
		moduleId: "client-records",
		moduleName: "Client Records",
		intent: "create",
		priority: 10,
		completed: true,
		steps: [
			{
				id: "client-records:create:details" as const,
				version: 1 as const,
				label: "Add details",
				description: "Save the client.",
				intent: "create",
				completed: true,
			},
		],
	},
	{
		id: "files:upload" as const,
		version: 1 as const,
		label: "Upload your first file",
		description: "Add a workspace file.",
		moduleId: "files",
		moduleName: "Files & Documents",
		intent: "upload",
		priority: 20,
		completed: false,
		steps: [
			{
				id: "files:upload:file" as const,
				version: 1 as const,
				label: "Upload it",
				description: "Save the file.",
				intent: "upload",
				completed: false,
			},
		],
	},
];

describe("buildFirstActionChecklistItems", () => {
	it("builds workspace-scoped module destinations", () => {
		expect(
			buildFirstActionChecklistItems("workspace-1", actions, null),
		).toEqual([
			expect.objectContaining({
				id: "client-records:create",
				steps: [
					expect.objectContaining({
						href: "/workspace-1/client-records?intent=create",
					}),
				],
			}),
			expect.objectContaining({
				id: "files:upload",
				steps: [
					expect.objectContaining({ href: "/workspace-1/files?intent=upload" }),
				],
			}),
		]);
	});

	it("marks the resolver-selected next step", () => {
		const items = buildFirstActionChecklistItems(
			"workspace-1",
			actions,
			"files:upload:file",
		);

		expect(items[0]?.steps[0]?.isNext).toBe(false);
		expect(items[1]?.steps[0]?.isNext).toBe(true);
	});

	it("adds Account security as non-blocking supplemental guidance", () => {
		const items = buildFirstActionChecklistItems("workspace-1", actions, null, {
			goal: {
				id: "account:security",
				version: 1,
				label: "Secure your account",
				description: "Review security.",
				surface: "account",
				intent: "security",
				optional: true,
				steps: [
					{
						id: "account:security:review",
						version: 1,
						label: "Review security",
						description: "Review it.",
						intent: "security",
					},
					{
						id: "account:security:2fa",
						version: 1,
						label: "Enable two-factor authentication",
						description: "Enable it.",
						intent: "two-factor",
						optional: true,
					},
				],
			},
			href: "http://localhost:3001/settings/security",
		});
		const security = items.at(-1);
		expect(security?.id).toBe("account:security");
		expect(security?.steps.every((step) => step.optional)).toBe(true);
		expect(security?.steps[1]?.label).toContain("two-factor");
	});

	it("completes only a non-empty checklist whose actions all have real outcomes", () => {
		expect(isFirstActionChecklistComplete([])).toBe(false);
		expect(
			isFirstActionChecklistComplete([
				{ steps: [{ optional: false, completed: true }] },
				{ steps: [{ optional: false, completed: false }] },
			]),
		).toBe(false);
		expect(
			isFirstActionChecklistComplete([
				{ steps: [{ optional: false, completed: true }] },
				{ steps: [{ optional: true, completed: false }] },
			]),
		).toBe(true);
	});

	it("starts collapsed after orientation without overwriting a stored preference", () => {
		expect(
			resolveInitialFirstActionChecklistCollapsed({
				hasStoredState: false,
				storedCollapsed: false,
			}),
		).toBe(true);
		expect(
			resolveInitialFirstActionChecklistCollapsed({
				hasStoredState: true,
				storedCollapsed: false,
			}),
		).toBe(false);
	});
});
