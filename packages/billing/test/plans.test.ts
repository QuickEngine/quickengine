import { describe, expect, it } from "vitest";
import {
	billableSeats,
	getPlanLimits,
	getStripePriceId,
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
