import { describe, expect, it } from "vitest";
import {
	flatRateTaxCalculator,
	noTaxCalculator,
	taxCalculatorFor,
} from "./tax";

/**
 * Tax arithmetic. Integers only — a float here becomes a cent that does not
 * reconcile, on a number a government expects to be exact.
 */
describe("flat-rate tax", () => {
	it("computes basis points against the subtotal", async () => {
		// 5% GST on $100.00
		expect(
			await flatRateTaxCalculator(500).calculate({
				subtotalCents: 10_000,
				currency: "CAD",
			}),
		).toBe(500);
		// 13% HST on $19.99
		expect(
			await flatRateTaxCalculator(1_300).calculate({
				subtotalCents: 1_999,
				currency: "CAD",
			}),
		).toBe(259);
	});

	it("rounds DOWN, never up", () => {
		// 1999 * 1300 / 10000 = 259.87 → 259, not 260. Over-charging tax creates a
		// remittance liability on money the business never collected.
		expect(
			flatRateTaxCalculator(1_300).calculate({
				subtotalCents: 1_999,
				currency: "CAD",
			}),
		).toBe(259);
	});

	it("returns zero for a zero or negative subtotal", () => {
		const calc = flatRateTaxCalculator(1_300);
		expect(calc.calculate({ subtotalCents: 0, currency: "CAD" })).toBe(0);
		expect(calc.calculate({ subtotalCents: -100, currency: "CAD" })).toBe(0);
	});

	it("treats a zero rate as no tax at all", () => {
		expect(
			flatRateTaxCalculator(0).calculate({
				subtotalCents: 10_000,
				currency: "CAD",
			}),
		).toBe(0);
	});
});

describe("choosing a calculator", () => {
	it("falls back to no tax when a workspace has set no rate", () => {
		expect(taxCalculatorFor({}).id).toBe(noTaxCalculator.id);
		expect(taxCalculatorFor({ taxRateBasisPoints: 0 }).id).toBe(
			noTaxCalculator.id,
		);
	});

	it("uses the operator's rate when one is set", () => {
		expect(taxCalculatorFor({ taxRateBasisPoints: 500 }).id).toBe("flat:500");
	});
});
