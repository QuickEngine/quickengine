import { describe, expect, it } from "vitest";
import { withinLapseGrace } from "../src/metering";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/**
 * A week of road after a paid subscription lapses.
 *
 * 🔴 The case this exists for: a card expires on a Friday. Without grace the
 * merchant's suppliers, purchase orders and partner payouts stop that afternoon,
 * and the first they hear of it is a customer saying the shop is broken. A failed
 * renewal is almost never a decision to leave.
 */
describe("the lapse grace window", () => {
	it("keeps a subscription that lapsed yesterday", () => {
		expect(withinLapseGrace(daysAgo(1))).toBe(true);
	});

	it("keeps one on the last day of the window", () => {
		expect(withinLapseGrace(daysAgo(6))).toBe(true);
	});

	it("lets go on the eighth day", () => {
		expect(withinLapseGrace(daysAgo(8))).toBe(false);
	});

	it("fails closed when no period end was ever recorded", () => {
		// 🔴 Never granted indefinitely. A missing timestamp is not evidence of a
		// recent lapse, and treating it as one would hand out the paid plan to
		// any row we failed to write properly.
		expect(withinLapseGrace(null)).toBe(false);
	});

	it("covers a period that has not even ended yet", () => {
		expect(withinLapseGrace(daysAgo(-3))).toBe(true);
	});
});
