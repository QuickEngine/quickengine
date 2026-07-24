import { describe, expect, it } from "vitest";
import { resolveGuidedActions } from "./guided-action-resolution";

const actions = [
	{
		id: "invoicing:create" as const,
		version: 1 as const,
		label: "Send an invoice",
		description: "Bill a client.",
		moduleId: "invoicing",
		moduleName: "Invoicing",
		priority: 1,
		steps: [
			{
				id: "invoicing:create:draft" as const,
				version: 1 as const,
				label: "Draft",
				description: "Draft it.",
				intent: "create",
			},
			{
				id: "invoicing:create:send" as const,
				version: 1 as const,
				label: "Send",
				description: "Send it.",
				intent: "send",
			},
			{
				id: "invoicing:create:review" as const,
				version: 1 as const,
				label: "Review",
				description: "Optional review.",
				intent: "review",
				optional: true,
			},
		],
	},
];

describe("resolveGuidedActions", () => {
	it("selects the first unfinished required step", () => {
		const result = resolveGuidedActions(actions, [
			{ id: "invoicing:create:draft", completed: true },
		]);
		expect(result.goals[0]?.completed).toBe(false);
		expect(result.nextStep?.id).toBe("invoicing:create:send");
	});

	it("does not let optional steps block goal completion", () => {
		const result = resolveGuidedActions(actions, [
			{ id: "invoicing:create:draft", completed: true },
			{ id: "invoicing:create:send", completed: true },
		]);
		expect(result.goals[0]?.completed).toBe(true);
		expect(result.nextStep).toBeNull();
	});

	it("rejects duplicate step identities", () => {
		expect(() => resolveGuidedActions([...actions, ...actions], [])).toThrow(
			"DUPLICATE_GUIDED_STEP:invoicing:create:draft",
		);
	});
});
