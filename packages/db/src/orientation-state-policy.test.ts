import { describe, expect, it } from "vitest";
import {
	QUICKDASH_ORIENTATION_VERSION,
	shouldOfferQuickDashOrientation,
} from "./orientation-state-policy";

describe("QuickDash orientation policy", () => {
	it("offers the current orientation when no state exists", () => {
		expect(shouldOfferQuickDashOrientation(undefined)).toBe(true);
	});

	it.each(["completed", "skipped"] as const)(
		"does not repeat a %s current orientation",
		(outcome) => {
			expect(
				shouldOfferQuickDashOrientation({
					orientationVersion: QUICKDASH_ORIENTATION_VERSION,
					outcome,
				}),
			).toBe(false);
		},
	);

	it("offers a newer orientation version", () => {
		expect(
			shouldOfferQuickDashOrientation({
				orientationVersion: QUICKDASH_ORIENTATION_VERSION - 1,
				outcome: "completed",
			}),
		).toBe(true);
	});
});
