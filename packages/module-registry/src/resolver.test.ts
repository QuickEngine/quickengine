import { describe, expect, it } from "vitest";
import {
	FOUNDATION_MODULE_IDS,
	resolveFoundationModules,
	resolveModules,
} from "./resolver";

describe("module dependency resolver", () => {
	it("resolves dependencies before the requested module", () => {
		expect(resolveModules(["payments"]).map((module) => module.id)).toEqual([
			"client-records",
			"invoicing",
			"payments",
		]);
	});

	it("deduplicates modules reached through multiple paths", () => {
		expect(
			resolveModules(["fulfillment", "payments", "invoicing"]).map(
				(module) => module.id,
			),
		).toEqual(["client-records", "invoicing", "payments", "fulfillment"]);
	});

	it("rejects unknown module ids", () => {
		expect(() => resolveModules(["not-a-module"])).toThrow(
			"UNKNOWN_MODULE:not-a-module",
		);
	});

	it("resolves the complete currently built foundation", () => {
		expect(FOUNDATION_MODULE_IDS).toEqual([
			"client-records",
			"invoicing",
			"payments",
			"fulfillment",
			"reporting-analytics",
		]);
		expect(resolveFoundationModules().map((module) => module.id)).toEqual([
			"client-records",
			"invoicing",
			"payments",
			"fulfillment",
			"reporting-analytics",
		]);
	});

	/**
	 * 🔴 The dashboard is the page a new workspace lands on, and every figure on
	 * it comes from one call to `/v1/reports/workspace`, which requires
	 * `reporting-analytics`. Leaving it out of the foundation put three tiles
	 * reading "This didn't load" in front of every new customer, with a Retry
	 * that could never work.
	 */
	it("starts every workspace with the module the dashboard needs", () => {
		expect(FOUNDATION_MODULE_IDS).toContain("reporting-analytics");
	});

	it("resolves the entire foundation from Fulfillment alone", () => {
		expect(resolveModules(["fulfillment"]).map((module) => module.id)).toEqual([
			"client-records",
			"invoicing",
			"payments",
			"fulfillment",
		]);
	});
});
