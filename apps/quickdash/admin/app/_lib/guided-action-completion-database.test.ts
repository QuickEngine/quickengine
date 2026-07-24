import { describe, expect, it, vi } from "vitest";
import {
	type GuidedStepCompletionDetectors,
	guidedStatusPolicies,
	resolveGuidedStepCompletions,
	SUPPORTED_GUIDED_STEP_IDS,
} from "./guided-action-completion";

function detectors(completed = false) {
	return Object.fromEntries(
		SUPPORTED_GUIDED_STEP_IDS.map((id) => [
			id,
			vi.fn().mockResolvedValue(completed),
		]),
	) as unknown as GuidedStepCompletionDetectors;
}

describe("resolveGuidedStepCompletions", () => {
	it("supports every declared module substep", () => {
		expect(SUPPORTED_GUIDED_STEP_IDS).toHaveLength(23);
		expect(new Set(SUPPORTED_GUIDED_STEP_IDS).size).toBe(23);
	});

	it("maps workflow status milestones without treating drafts as progress", () => {
		expect(guidedStatusPolicies.nonDraft("draft")).toBe(false);
		expect(guidedStatusPolicies.nonDraft("sent")).toBe(true);
		expect(guidedStatusPolicies.fulfillmentComplete("in_progress")).toBe(false);
		expect(guidedStatusPolicies.fulfillmentComplete("fulfilled")).toBe(true);
		expect(guidedStatusPolicies.bookingConfirmed("requested")).toBe(false);
		expect(guidedStatusPolicies.bookingConfirmed("confirmed")).toBe(true);
		expect(guidedStatusPolicies.orderConfirmed("placed")).toBe(false);
		expect(guidedStatusPolicies.orderConfirmed("processing")).toBe(true);
		expect(guidedStatusPolicies.timeReviewed("draft")).toBe(false);
		expect(guidedStatusPolicies.timeReviewed("approved")).toBe(true);
		expect(guidedStatusPolicies.shipmentDispatched("ready")).toBe(false);
		expect(guidedStatusPolicies.shipmentDispatched("shipped")).toBe(true);
	});

	it("deduplicates requested steps and preserves order", async () => {
		const result = await resolveGuidedStepCompletions(
			"workspace-1",
			[
				"invoicing:create:draft",
				"invoicing:create:send",
				"invoicing:create:draft",
			],
			detectors(true),
		);
		expect(result).toEqual([
			{ id: "invoicing:create:draft", completed: true },
			{ id: "invoicing:create:send", completed: true },
		]);
	});

	it("rejects empty workspaces and unsupported steps", async () => {
		await expect(
			resolveGuidedStepCompletions(" ", [], detectors()),
		).rejects.toThrow("GUIDED_STEP_WORKSPACE_REQUIRED");
		await expect(
			resolveGuidedStepCompletions(
				"workspace-1",
				["unknown:step:id"],
				detectors(),
			),
		).rejects.toThrow("GUIDED_STEP_COMPLETION_UNSUPPORTED:unknown:step:id");
	});
});
