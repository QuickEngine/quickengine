import { describe, expect, it } from "vitest";
import {
	defaultFirstActionChecklistState,
	resolveFirstActionChecklistState,
} from "./first-action-state-policy";

describe("first-action checklist state policy", () => {
	it("starts expanded and visible", () => {
		expect(defaultFirstActionChecklistState()).toEqual({
			version: 1,
			collapsed: false,
			dismissedAt: null,
		});
	});

	it("restores presentation state for the current version", () => {
		const dismissedAt = new Date("2026-07-21T12:00:00.000Z");
		expect(
			resolveFirstActionChecklistState({
				checklistVersion: 1,
				collapsed: true,
				dismissedAt,
			}),
		).toEqual({ version: 1, collapsed: true, dismissedAt });
	});

	it("resets presentation state when the checklist version changes", () => {
		expect(
			resolveFirstActionChecklistState(
				{
					checklistVersion: 1,
					collapsed: true,
					dismissedAt: new Date("2026-07-21T12:00:00.000Z"),
				},
				2,
			),
		).toEqual({ version: 2, collapsed: false, dismissedAt: null });
	});

	it("rejects invalid versions", () => {
		expect(() => defaultFirstActionChecklistState(0)).toThrow(
			"FIRST_ACTION_CHECKLIST_VERSION_INVALID",
		);
	});
});
