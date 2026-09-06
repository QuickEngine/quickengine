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

/**
 * 🔴 The dashboard's data source, on the path onboarding ACTUALLY takes.
 *
 * The first attempt at this fix added `reporting-analytics` to
 * `FOUNDATION_MODULE_IDS` and changed nothing, because that set is only
 * consulted when a caller requests no modules at all. Onboarding always sends
 * the business recipe's module list, so it goes through `resolveModules` and
 * never touches the foundation. A test on the foundation alone passed happily
 * while every real signup still landed on a broken dashboard.
 *
 * This asserts the resolver keeps the module when it is asked for alongside a
 * realistic recipe, which is what the route now does.
 */
describe("the module the dashboard cannot work without", () => {
	it("survives resolution alongside a real recipe", () => {
		const recipe = [
			"client-records",
			"orders",
			"payments",
			"inventory",
			"products-services",
			"reporting-analytics",
		];
		expect(resolveModules(recipe).map((module) => module.id)).toContain(
			"reporting-analytics",
		);
	});
});
