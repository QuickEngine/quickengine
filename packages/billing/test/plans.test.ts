import { describe, expect, it } from "vitest";
import {
	billableSeats,
	getPlanLimits,
	getStripePriceId,
	OVERAGE,
	PLANS,
	planIdForPriceId,
	TEAMS_MIN_SEATS,
} from "../src/plans";

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

describe("per-seat plans", () => {
	it("scales every metered allowance with the seat count", () => {
		const sixteen = getPlanLimits("teams", 16);
		const thirtyTwo = getPlanLimits("teams", 32);
		expect(thirtyTwo.apiRequests).toBe((sixteen.apiRequests ?? 0) * 2);
		expect(thirtyTwo.aiActions).toBe((sixteen.aiActions ?? 0) * 2);
		expect(thirtyTwo.storageBytes).toBe((sixteen.storageBytes ?? 0) * 2);
	});

	// The reason the floor exists: moving up a tier must never cost capacity.
	it("gives the smallest Teams account more than Scale in every dimension", () => {
		const teams = getPlanLimits("teams", TEAMS_MIN_SEATS);
		const scale = getPlanLimits("scale");
		expect(teams.apiRequests ?? 0).toBeGreaterThan(scale.apiRequests ?? 0);
		expect(teams.aiActions ?? 0).toBeGreaterThan(scale.aiActions ?? 0);
		expect(teams.storageBytes ?? 0).toBeGreaterThan(scale.storageBytes ?? 0);
	});

	it("never bills or provisions below the floor", () => {
		expect(billableSeats(1)).toBe(TEAMS_MIN_SEATS);
		expect(billableSeats(12)).toBe(TEAMS_MIN_SEATS);
		expect(billableSeats(40)).toBe(40);
	});

	// A missing seat count under-grants rather than over-grants. A throttled
	// customer is visible; an unmetered one is a silent revenue hole.
	it("falls back to the floor when the seat count is missing", () => {
		expect(getPlanLimits("teams")).toEqual(
			getPlanLimits("teams", TEAMS_MIN_SEATS),
		);
	});

	it("leaves flat tiers untouched by a seat count", () => {
		expect(getPlanLimits("grow", 99)).toEqual(getPlanLimits("grow"));
	});

	it("caps neither seats nor workspaces, because every seat is billed", () => {
		const teams = getPlanLimits("teams", 20);
		expect(teams.seats).toBeNull();
		expect(teams.workspaces).toBeNull();
	});
});

// The gauges these gates read were never written before 2026-08-01, so both
// limits were advertised on every plan and enforced on none.
describe("gauge limits", () => {
	it("gives Free exactly one seat and one workspace", () => {
		const free = getPlanLimits("free");
		// 🔴 ONE seat, and the guard matters: a second seat was tried and reverted
		// on 2026-09-06 because free already carries all sixteen modules and no
		// transaction fee, so a two person business would never have to pay.
		expect(free.seats).toBe(1);
		// One workspace still. A second business is a real step up, and it is the
		// cheapest honest thing to ask somebody to pay for.
		expect(free.workspaces).toBe(1);
	});

	it("raises both on every paid flat tier", () => {
		for (const id of ["launch", "grow", "scale"] as const) {
			const paid = getPlanLimits(id);
			expect(paid.seats ?? 0).toBeGreaterThan(1);
			expect(paid.workspaces ?? 0).toBeGreaterThan(1);
		}
	});
});

/**
 * The walls that stop Free being a home rather than a trial.
 *
 * 🔴 Added 2026-09-06 after the honest finding that metering only API requests,
 * storage and AI let a real single-merchant shop run on Free permanently: steady
 * retail never approaches 25,000 requests a month, and a shop without suppliers
 * never meets the only capability gate. Nothing ever asked them to pay.
 */
describe("the Free tier walls", () => {
	it("caps orders and products on Free", () => {
		const free = getPlanLimits("free");
		expect(free.ordersPerMonth).toBe(25);
		expect(free.activeProducts).toBe(25);
	});

	it("caps them on NO paid tier", () => {
		// The ceiling is what makes Free a trial. Above it, the ceiling was never
		// the product, and a paid customer must never meet one.
		for (const id of ["commerce", "scale", "teams", "enterprise"] as const) {
			const limits = getPlanLimits(id, 16);
			expect(limits.ordersPerMonth).toBeNull();
			expect(limits.activeProducts).toBeNull();
		}
	});

	it("never prices an order or a product", () => {
		// 🔴 Hard rule 7. These gate which plan fits; they must never bill. A
		// per-order fee is charging somebody for the business they built.
		expect(OVERAGE.ordersPerMonth).toBeNull();
		expect(OVERAGE.activeProducts).toBeNull();
	});

	it("does not multiply the ceilings by seat count on a per-seat plan", () => {
		// Expand has no ceiling to scale. Multiplying null by sixteen would be a
		// number, and inventing a limit the plan says does not exist.
		expect(getPlanLimits("teams", 16).ordersPerMonth).toBeNull();
	});
});
