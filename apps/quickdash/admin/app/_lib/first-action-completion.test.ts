import { describe, expect, it, vi } from "vitest";
import {
	type FirstActionCompletionDetectors,
	resolveFirstActionCompletions,
	SUPPORTED_FIRST_ACTION_IDS,
} from "./first-action-completion";

function createDetectors(
	completedIds: readonly string[] = [],
): FirstActionCompletionDetectors {
	const completed = new Set(completedIds);
	return Object.fromEntries(
		SUPPORTED_FIRST_ACTION_IDS.map((id) => [
			id,
			vi.fn(async () => completed.has(id)),
		]),
	) as unknown as FirstActionCompletionDetectors;
}

describe("first-action completion", () => {
	it("detects requested actions from real-record detector results", async () => {
		const detectors = createDetectors([
			"client-records:create",
			"invoicing:create",
		]);

		await expect(
			resolveFirstActionCompletions(
				"workspace-1",
				[
					"client-records:create",
					"products-services:create",
					"invoicing:create",
				],
				detectors,
			),
		).resolves.toEqual([
			{ id: "client-records:create", completed: true },
			{ id: "products-services:create", completed: false },
			{ id: "invoicing:create", completed: true },
		]);
	});

	it("queries only unique requested actions in parallel", async () => {
		const detectors = createDetectors();

		await resolveFirstActionCompletions(
			"workspace-1",
			["client-records:create", "client-records:create", "payments:record"],
			detectors,
		);

		expect(detectors["client-records:create"]).toHaveBeenCalledOnce();
		expect(detectors["client-records:create"]).toHaveBeenCalledWith(
			"workspace-1",
		);
		expect(detectors["payments:record"]).toHaveBeenCalledOnce();
		expect(detectors["orders:create"]).not.toHaveBeenCalled();
	});

	it("rejects missing workspace scope and unsupported action IDs", async () => {
		const detectors = createDetectors();

		await expect(
			resolveFirstActionCompletions("  ", [], detectors),
		).rejects.toThrow("FIRST_ACTION_WORKSPACE_REQUIRED");
		await expect(
			resolveFirstActionCompletions(
				"workspace-1",
				["reporting-analytics:view"],
				detectors,
			),
		).rejects.toThrow(
			"FIRST_ACTION_COMPLETION_UNSUPPORTED:reporting-analytics:view",
		);
	});
});
