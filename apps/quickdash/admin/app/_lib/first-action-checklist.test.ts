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
		steps: [
			{
				id: "client-records:create:details" as const,
				version: 1 as const,
				label: "Add details",
				description: "Save the client.",
				intent: "create",
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
		steps: [
			{
				id: "files:upload:file" as const,
				version: 1 as const,
				label: "Upload it",
				description: "Save the file.",
				intent: "upload",
			},
		],
	},
];

describe("buildFirstActionChecklistItems", () => {
	it("builds workspace-scoped module destinations", () => {
		expect(buildFirstActionChecklistItems("workspace-1", actions, [])).toEqual([
			expect.objectContaining({
				id: "client-records:create",
				href: "/workspace-1/client-records?intent=create",
			}),
			expect.objectContaining({
				id: "files:upload",
				href: "/workspace-1/files?intent=upload",
			}),
		]);
	});

	it("uses real completion results and defaults missing results to incomplete", () => {
		const items = buildFirstActionChecklistItems("workspace-1", actions, [
			{ id: "client-records:create", completed: true },
		]);

		expect(items.map(({ id, completed }) => ({ id, completed }))).toEqual([
			{ id: "client-records:create", completed: true },
			{ id: "files:upload", completed: false },
		]);
	});

	it("completes only a non-empty checklist whose actions all have real outcomes", () => {
		expect(isFirstActionChecklistComplete([])).toBe(false);
		expect(
			isFirstActionChecklistComplete([
				{ completed: true },
				{ completed: false },
			]),
		).toBe(false);
		expect(
			isFirstActionChecklistComplete([
				{ completed: true },
				{ completed: true },
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
