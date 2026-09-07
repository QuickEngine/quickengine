import { describe, expect, it } from "vitest";
import { FREE_OVERAGE_CAP_CENTS, overageFor } from "../src/plans";

/**
 * Overage exists for two different reasons, and confusing them would either
 * charge a paying customer for their own sales or shut a free account off
 * mid-month.
 *
 * 🔴 Replaces an earlier test that asserted orders and products are NEVER
 * priced. That was right when free was a wall. Free is now a ramp: past the cap
 * somebody keeps trading and pays for what they use, and the bill arrives at
 * the Commerce price on its own. The promise that survives is the narrower and
 * more important one: **no plan somebody pays for is ever charged per order.**
 */
describe("what overage costs, by plan", () => {
	describe("things that cost us money are billed on every plan", () => {
		it.each(["free", "commerce", "scale", "teams"] as const)(
			"charges %s for storage",
			(plan) => {
				expect(overageFor(plan, "storageBytes")).not.toBeNull();
			},
		);

		it.each(["free", "commerce", "scale", "teams"] as const)(
			"charges %s for AI actions",
			(plan) => {
				expect(overageFor(plan, "aiActions")).not.toBeNull();
			},
		);
	});

	describe("things that cost us nothing are billed on free only", () => {
		it("prices orders on free", () => {
			expect(overageFor("free", "ordersPerMonth")).toEqual({
				blockSize: 1,
				cents: 25,
			});
		});

		it("prices products on free", () => {
			expect(overageFor("free", "activeProducts")).toEqual({
				blockSize: 1,
				cents: 50,
			});
		});

		it.each(["commerce", "scale", "teams", "enterprise"] as const)(
			"never charges %s for an order",
			(plan) => {
				// 🔴 The line the whole ladder rests on. If this fails, an invoice
				// somewhere reads "1,200 orders" and "we take 0% of your sales"
				// stops being true.
				expect(overageFor(plan, "ordersPerMonth")).toBeNull();
			},
		);

		it.each(["commerce", "scale", "teams", "enterprise"] as const)(
			"never charges %s for a product",
			(plan) => {
				expect(overageFor(plan, "activeProducts")).toBeNull();
			},
		);
	});

	describe("the free bill lands where it should", () => {
		const bill = (orders: number, products: number, gigabytes: number) => {
			const order = overageFor("free", "ordersPerMonth");
			const product = overageFor("free", "activeProducts");
			const storage = overageFor("free", "storageBytes");
			return (
				Math.max(0, orders - 25) * (order?.cents ?? 0) +
				Math.max(0, products - 25) * (product?.cents ?? 0) +
				Math.max(0, gigabytes - 2) * (storage?.cents ?? 0)
			);
		};

		it("stays pocket change for a side project", () => {
			// 40 orders, 30 products, 3 GB. This is the accessible tier nobody had
			// to invent: it prices itself.
			expect(bill(40, 30, 3)).toBeLessThan(1500);
		});

		it("stays affordable for a small shop", () => {
			// 120 orders, 60 products, 8 GB. Real trading, and still well under
			// the plan price: this is the ramp working.
			expect(bill(120, 60, 8)).toBeLessThan(FREE_OVERAGE_CAP_CENTS);
		});

		it("hits the cap for a business that has outgrown free", () => {
			// 🔴 The calibration that makes the model work, and the reason the cap
			// exists rather than a higher per-unit price. At 25 cents an order the
			// bill would not reach the Commerce price until somewhere past 600
			// orders a month, so a real business could otherwise sit on free
			// paying less than the plan forever. Raising the price to close that
			// gap would mean charging about 5% of a ten dollar order.
			expect(bill(600, 300, 50)).toBeGreaterThan(FREE_OVERAGE_CAP_CENTS);
		});

		it("caps below the plan it is meant to sell", () => {
			// Somebody at the ceiling is told the plan costs less than the overage
			// they are about to keep paying. That is a true sentence and an easy
			// decision; a cap above $149 would not be.
			expect(FREE_OVERAGE_CAP_CENTS).toBeLessThan(14_900);
		});
	});
});
