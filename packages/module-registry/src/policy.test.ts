import { describe, expect, it } from "vitest";
import { planModuleEnablement, planModulesEnablement } from "./enablement";
import {
	assertModuleCanBeDisabled,
	findEnabledDependents,
	mergeModuleSettings,
	parseModuleSettings,
} from "./policy";

describe("module registry policy", () => {
	it("finds direct and transitive enabled dependents", () => {
		expect(
			findEnabledDependents("client-records", [
				"invoicing",
				"payments",
				"fulfillment",
			]),
		).toEqual(["invoicing", "payments", "fulfillment"]);
		expect(findEnabledDependents("payments", ["fulfillment"])).toEqual([
			"fulfillment",
		]);
	});

	it("never allows a foundation module to be disabled", () => {
		for (const moduleId of [
			"client-records",
			"invoicing",
			"payments",
			"fulfillment",
		]) {
			expect(() => assertModuleCanBeDisabled(moduleId, [])).toThrow(
				`FOUNDATION_MODULE_REQUIRED:${moduleId}`,
			);
		}
	});

	it("reports dependency blockers before a disable is attempted", () => {
		expect(
			findEnabledDependents("invoicing", ["payments", "fulfillment"]),
		).toEqual(["payments", "fulfillment"]);
	});

	it("rejects unknown module ids", () => {
		expect(() => findEnabledDependents("unknown", [])).toThrow(
			"UNKNOWN_MODULE:unknown",
		);
		expect(() => parseModuleSettings("unknown", {})).toThrow(
			"UNKNOWN_MODULE:unknown",
		);
	});

	it("validates and fills defaults through the module's settings contract", () => {
		expect(parseModuleSettings("fulfillment", {})).toEqual({
			defaultKind: "other",
			completionLabel: "Delivered",
		});
	});

	it("rejects settings that violate the module's contract", () => {
		expect(() =>
			parseModuleSettings("fulfillment", { completionLabel: "" }),
		).toThrow();
	});

	it("recognizes Products & Services as an optional module", () => {
		expect(parseModuleSettings("products-services", {})).toEqual({
			defaultCurrency: "USD",
			productLabelPlural: "Products",
			serviceLabelPlural: "Services",
			showSku: true,
		});
		expect(() =>
			assertModuleCanBeDisabled("products-services", ["products-services"]),
		).not.toThrow();
	});

	it("prevents removing Products & Services while Orders uses it", () => {
		expect(
			findEnabledDependents("products-services", [
				"products-services",
				"orders",
			]),
		).toEqual(["orders"]);
		expect(() =>
			assertModuleCanBeDisabled("products-services", [
				"products-services",
				"orders",
			]),
		).toThrow("MODULE_REQUIRED_BY:products-services:orders");
	});

	it("allows Orders itself to be disabled", () => {
		expect(() =>
			assertModuleCanBeDisabled("orders", ["products-services", "orders"]),
		).not.toThrow();
	});

	it("recognizes Inventory as optional with safe stock defaults", () => {
		expect(parseModuleSettings("inventory", {})).toEqual({
			defaultLowStockThreshold: 5,
			allowNegativeStock: false,
		});
		expect(() =>
			assertModuleCanBeDisabled("inventory", ["inventory"]),
		).not.toThrow();
	});

	it("prevents removing Products & Services while Inventory uses it", () => {
		expect(
			findEnabledDependents("products-services", [
				"products-services",
				"inventory",
			]),
		).toEqual(["inventory"]);
		expect(() =>
			assertModuleCanBeDisabled("products-services", [
				"products-services",
				"inventory",
			]),
		).toThrow("MODULE_REQUIRED_BY:products-services:inventory");
	});

	it("merges a partial patch without losing other saved settings", () => {
		expect(
			mergeModuleSettings(
				"fulfillment",
				{ defaultKind: "digital", completionLabel: "Delivered" },
				{ completionLabel: "Sent" },
			),
		).toEqual({ defaultKind: "digital", completionLabel: "Sent" });
	});

	it("rejects an invalid partial patch after merging", () => {
		expect(() =>
			mergeModuleSettings(
				"fulfillment",
				{ defaultKind: "service", completionLabel: "Completed" },
				{ defaultKind: "unsupported" },
			),
		).toThrow();
	});
});

describe("module enablement plan", () => {
	it("enables Products & Services before Inventory", () => {
		expect(
			planModuleEnablement("inventory", []).map((item) => item.moduleId),
		).toEqual(["products-services", "inventory"]);
	});

	it("enables the full Orders dependency chain in canonical order", () => {
		expect(
			planModuleEnablement("orders", []).map((item) => item.moduleId),
		).toEqual([
			"client-records",
			"products-services",
			"invoicing",
			"payments",
			"fulfillment",
			"orders",
		]);
	});

	it("adds a requested module and all missing dependencies in order", () => {
		expect(planModuleEnablement("fulfillment", [])).toEqual([
			expect.objectContaining({ moduleId: "client-records", isNew: true }),
			expect.objectContaining({ moduleId: "invoicing", isNew: true }),
			expect.objectContaining({ moduleId: "payments", isNew: true }),
			expect.objectContaining({ moduleId: "fulfillment", isNew: true }),
		]);
	});

	it("does not rewrite modules that are already enabled", () => {
		expect(
			planModuleEnablement("invoicing", [
				{ moduleId: "client-records", enabled: true, settings: {} },
				{ moduleId: "invoicing", enabled: true, settings: {} },
			]),
		).toEqual([]);
	});

	it("preserves validated settings when re-enabling a disabled module", () => {
		const [item] = planModuleEnablement("fulfillment", [
			{ moduleId: "client-records", enabled: true, settings: {} },
			{ moduleId: "invoicing", enabled: true, settings: {} },
			{ moduleId: "payments", enabled: true, settings: {} },
			{
				moduleId: "fulfillment",
				enabled: false,
				settings: { defaultKind: "service", completionLabel: "Completed" },
			},
		]);

		expect(item).toEqual({
			moduleId: "fulfillment",
			settings: { defaultKind: "service", completionLabel: "Completed" },
			isNew: false,
		});
	});

	it("deduplicates dependencies shared across a recipe", () => {
		expect(
			planModulesEnablement(["payments", "fulfillment"], []).map(
				(item) => item.moduleId,
			),
		).toEqual(["client-records", "invoicing", "payments", "fulfillment"]);
	});
});
