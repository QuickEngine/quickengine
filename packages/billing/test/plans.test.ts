import { describe, expect, it } from "vitest";
import { getStripePriceId, PLANS, planIdForPriceId } from "../src/plans";

describe("plan config", () => {
	it("exposes the free tier with no Stripe price", () => {
		const free = PLANS.find((plan) => plan.id === "free");
		expect(free?.free).toBe(true);
		expect(Object.keys(free?.priceEnv ?? {})).toHaveLength(0);
	});

	it("resolves a configured price ID from env", () => {
		// STRIPE_PRICE_GROW_MONTHLY is set in vitest.config.
		expect(getStripePriceId("grow", "monthly")).toBe("price_test_grow_monthly");
	});

	it("returns undefined for an unset price", () => {
		expect(getStripePriceId("scale", "annual")).toBeUndefined();
	});

	it("reverse-maps a known price ID to its plan", () => {
		expect(planIdForPriceId("price_test_grow_monthly")).toBe("grow");
	});

	it("returns undefined for an unknown price ID", () => {
		expect(planIdForPriceId("price_does_not_exist")).toBeUndefined();
	});
});
