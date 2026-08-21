import { listModules, resolveFirstActions } from "@quickengine/module-registry";
import { describe, expect, it } from "vitest";
import {
	type GuidedStepCompletionDetectors,
	resolveGuidedStepCompletions,
	SUPPORTED_GUIDED_STEP_IDS,
} from "./quickdash-guided-action-completion";

const never = async () => false;

/** Every supported id wired to a detector that answers, so nothing is missing. */
const detectors = Object.fromEntries(
	SUPPORTED_GUIDED_STEP_IDS.map((id) => [id, never]),
) as unknown as GuidedStepCompletionDetectors;

describe("guided step completion", () => {
	/**
	 * 🔴 The regression this file exists for.
	 *
	 * An unmapped step id used to throw, and `/v1/quickdash/context` is the one
	 * call carrying the workspace name, the module list AND the checklist — so a
	 * single unmapped id answered 500 and the console rendered a blank name over
	 * an empty sidebar. The workspace looked deleted. It was not: it had a module
	 * enabled whose first-action steps had no detector.
	 */
	it("reports an unmapped step as not completed instead of throwing", async () => {
		const completions = await resolveGuidedStepCompletions(
			"workspace_1",
			["client-records:create:details", "not-a-module:not-a:step"],
			detectors,
		);

		expect(completions).toHaveLength(2);
		expect(completions).toContainEqual({
			id: "not-a-module:not-a:step",
			completed: false,
		});
	});

	it("still requires a workspace", async () => {
		await expect(
			resolveGuidedStepCompletions(
				"  ",
				["client-records:create:details"],
				detectors,
			),
		).rejects.toThrow("GUIDED_STEP_WORKSPACE_REQUIRED");
	});

	/**
	 * The other half of the same defect: the detector map going stale as modules
	 * gain first actions. Failing soft keeps the console alive, but a step with no
	 * detector can never be ticked, so this fails the build rather than shipping a
	 * checklist item nobody can complete.
	 */
	it("has a detector for every first-action step every module declares", () => {
		const manifests = listModules();
		const declared = resolveFirstActions({
			manifests,
			enabledModuleIds: manifests.map((module) => module.id),
			preferredActionIds: manifests.flatMap((module) =>
				(module.firstActions ?? []).map((action) => action.id),
			),
		}).flatMap((action) => action.steps.map((step) => step.id));

		const supported = new Set<string>(SUPPORTED_GUIDED_STEP_IDS);
		expect([...new Set(declared)].filter((id) => !supported.has(id))).toEqual(
			[],
		);
	});
});
