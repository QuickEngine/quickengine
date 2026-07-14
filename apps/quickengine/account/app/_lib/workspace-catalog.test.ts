import { describe, expect, it } from "vitest";
import { BUSINESS_TYPE_CATALOG, getBusinessType } from "./workspace-catalog";

describe("business type catalog", () => {
	it("has unique stable ids", () => {
		const ids = BUSINESS_TYPE_CATALOG.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) {
			expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
		}
	});

	it("contains broad local and online business starting points", () => {
		expect(getBusinessType("ecommerce")?.name).toBe("E-commerce");
		expect(getBusinessType("print-shop")?.name).toBe(
			"Print & Custom Production",
		);
		expect(getBusinessType("trades")?.name).toBe("Trades & Contracting");
	});
});
