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
		]);
		expect(resolveFoundationModules().map((module) => module.id)).toEqual([
			"client-records",
			"invoicing",
			"payments",
			"fulfillment",
		]);
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
