import { describe, expect, it } from "vitest";
import {
	buildQuickDashOrientationSteps,
	getQuickDashOrientationNotchClass,
	getQuickDashOrientationPlacementClass,
} from "./quickdash-orientation";

describe("QuickDash orientation", () => {
	it("stays to four concise interface-orientation steps", () => {
		const steps = buildQuickDashOrientationSteps({
			workspaceName: "Northstar",
		});

		expect(steps).toHaveLength(4);
		expect(steps.map((step) => step.title)).toEqual([
			"Northstar is ready",
			"Your tools live on the left",
			"Workspace settings stay separate",
			"Your account is always within reach",
		]);
		expect(steps.map((step) => step.placement)).toEqual([
			"workspace-switcher",
			"module-navigation",
			"workspace-settings",
			"account",
		]);
	});

	it("moves one card between the three dashboard regions", () => {
		expect(
			getQuickDashOrientationPlacementClass("workspace-switcher"),
		).toContain("top-20");
		expect(
			getQuickDashOrientationPlacementClass("module-navigation"),
		).toContain("--sidebar-width");
		expect(
			getQuickDashOrientationPlacementClass("workspace-settings"),
		).toContain("bottom-8");
		expect(getQuickDashOrientationPlacementClass("account")).toContain(
			"right-5",
		);
	});

	it("points its notch toward each described region", () => {
		expect(getQuickDashOrientationNotchClass("workspace-switcher")).toContain(
			"-top-1.5",
		);
		expect(getQuickDashOrientationNotchClass("module-navigation")).toContain(
			"-left-1.5",
		);
		expect(getQuickDashOrientationNotchClass("workspace-settings")).toContain(
			"-left-1.5",
		);
		expect(getQuickDashOrientationNotchClass("account")).toContain("-top-1.5");
	});
});
