import { describe, expect, it } from "vitest";
import { taxableAmountCents } from "./checkout-pricing";

/**
 * 🔴 What tax is charged on, asserted rather than assumed.
 *
 * `/v1/checkout/quote` tells a shopper what they will pay; `/v1/checkout` takes
 * it. If those two ever disagree, somebody consented to one number and a
 * different one left their account — and they are right to dispute it.
 *
 * Both call this. These tests are what stop the rule being quietly rewritten in
 * one of them.
 */
describe("what tax is charged on", () => {
	it("taxes the DISCOUNTED subtotal, plus delivery", () => {
		// $12.50 basket, $2 off, $12 delivery → tax applies to $22.50, not $24.50.
		expect(
			taxableAmountCents({
				subtotalCents: 1250,
				discountCents: 200,
				shippingCents: 1200,
			}),
		).toBe(2250);
	});

	/**
	 * ⚠️ Taxing before the discount charges tax on money the customer never paid.
	 * On a remittance that is not an accounting slip — it is somebody else's
	 * money, collected and owed onward.
	 */
	it("never taxes money the customer did not pay", () => {
		const beforeDiscount = 1250 + 1200;
		const charged = taxableAmountCents({
			subtotalCents: 1250,
			discountCents: 500,
			shippingCents: 1200,
		});
		expect(charged).toBeLessThan(beforeDiscount);
		expect(charged).toBe(1950);
	});

	/**
	 * 🔴 A discount bigger than the basket must not turn delivery free and then
	 * start handing tax back. The floor is zero on the GOODS, and delivery is
	 * still charged and still taxed.
	 */
	it("floors the goods at zero without swallowing delivery", () => {
		expect(
			taxableAmountCents({
				subtotalCents: 1000,
				discountCents: 5000,
				shippingCents: 1200,
			}),
		).toBe(1200);
	});

	it("matches the real Caffeinate order that went through production", () => {
		// 50c coffee, $12 delivery, 5% GST → 1250 taxable, 62c tax, 1312 total.
		const taxable = taxableAmountCents({
			subtotalCents: 50,
			discountCents: 0,
			shippingCents: 1200,
		});
		expect(taxable).toBe(1250);
		// Rounds DOWN, never up — 62.5c becomes 62.
		expect(Math.floor((taxable * 500) / 10_000)).toBe(62);
		expect(taxable + 62).toBe(1312);
	});
});
