import { describe, expect, it } from "vitest";
import { discountAmountCents } from "./discounts";
import { computeOrderTotals } from "./totals";

/**
 * 🔴 Pure money arithmetic. A bug here is money — either the shop's, given away,
 * or the customer's, taken wrongly. Kept free of the database so every edge can
 * be covered cheaply.
 */
describe("what a discount takes off", () => {
	const pct = (bp: number) => ({ valueType: "percentage", value: bp });
	const fixed = (cents: number) => ({ valueType: "fixed", value: cents });

	it("computes a percentage in basis points", () => {
		expect(discountAmountCents(pct(1_000), 10_000)).toBe(1_000); // 10% of 100.00
		expect(discountAmountCents(pct(2_500), 8_000)).toBe(2_000); // 25% of 80.00
	});

	it("rounds DOWN, never up", () => {
		// 1999 * 1000 / 10000 = 199.9 → 199. Rounding up gives away a penny of the
		// shop's money on every order, which is somebody else's decision to make.
		expect(discountAmountCents(pct(1_000), 1_999)).toBe(199);
		expect(discountAmountCents(pct(3_333), 999)).toBe(332);
	});

	it("never exceeds the subtotal", () => {
		// 🔴 A fixed 50.00 code on a 10.00 order must take off 10.00, not 50.00.
		// Otherwise a sale becomes a refund and a mistyped code pays customers.
		expect(discountAmountCents(fixed(5_000), 1_000)).toBe(1_000);
		expect(discountAmountCents(pct(10_000), 4_200)).toBe(4_200); // 100%
	});

	it("returns nothing for an empty or negative subtotal", () => {
		expect(discountAmountCents(pct(1_000), 0)).toBe(0);
		expect(discountAmountCents(fixed(500), -100)).toBe(0);
	});

	it("handles a fixed amount smaller than a penny of percentage", () => {
		expect(discountAmountCents(fixed(1), 10_000)).toBe(1);
	});
});

describe("order totals with a discount", () => {
	const line = { quantity: 1, unitPriceCents: 10_000 };

	it("subtracts the discount before adding tax", () => {
		// 🔴 Tax on the DISCOUNTED subtotal. Taxing 100.00 and then discounting
		// charges tax on money the customer never paid — and on a remittance that
		// is the government's money, not the shop's.
		const totals = computeOrderTotals([line], 450, 1_000); // 10.00 off, then 5% of 90.00
		expect(totals).toEqual({
			subtotalCents: 10_000,
			discountCents: 1_000,
			shippingCents: 0,
			taxCents: 450,
			totalCents: 9_450,
		});
	});

	it("clamps a discount larger than the subtotal", () => {
		const totals = computeOrderTotals([line], 0, 50_000);
		expect(totals.discountCents).toBe(10_000);
		expect(totals.totalCents).toBe(0);
	});

	it("ignores a negative discount rather than inflating the total", () => {
		const totals = computeOrderTotals([line], 0, -500);
		expect(totals.discountCents).toBe(0);
		expect(totals.totalCents).toBe(10_000);
	});

	it("still works with no discount at all", () => {
		expect(computeOrderTotals([line], 500)).toEqual({
			subtotalCents: 10_000,
			discountCents: 0,
			shippingCents: 0,
			taxCents: 500,
			totalCents: 10_500,
		});
	});

	it("never produces a negative total", () => {
		const totals = computeOrderTotals([line], 0, Number.MAX_SAFE_INTEGER);
		expect(totals.totalCents).toBeGreaterThanOrEqual(0);
	});
});
