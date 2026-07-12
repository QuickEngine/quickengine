import { describe, expect, it } from "vitest";
import {
	counterPeriod,
	evaluate,
	periodFor,
	SENTINEL_PERIOD,
	withinGrace,
} from "../src/_metering-core";

// Pure limit math — the part that decides warn/over and whether new work may
// start. Leads with the edges (zero limit, exactly-at-limit, past grace, null).
describe("evaluate — usage vs limit", () => {
	it("is ok well under the limit", () => {
		expect(evaluate("actions", 1000, 100)).toMatchObject({
			used: 100,
			limit: 1000,
			remaining: 900,
			exceeded: false,
			state: "ok",
		});
	});

	it("warns exactly at the 80% threshold, not a tick before", () => {
		expect(evaluate("actions", 1000, 799).state).toBe("ok");
		expect(evaluate("actions", 1000, 800).state).toBe("warn");
	});

	it("is over at 100% and beyond, with exceeded + zero remaining", () => {
		expect(evaluate("actions", 1000, 1000)).toMatchObject({
			state: "over",
			exceeded: true,
			remaining: 0,
		});
		expect(evaluate("actions", 1000, 5000)).toMatchObject({
			state: "over",
			exceeded: true,
			remaining: 0,
		});
	});

	it("treats null as unlimited — never over, remaining null", () => {
		expect(evaluate("workspaces", null, 10 ** 9)).toMatchObject({
			limit: null,
			remaining: null,
			exceeded: false,
			state: "ok",
		});
	});

	it("treats a zero limit as fully consumed by any use", () => {
		expect(evaluate("seats", 0, 0).state).toBe("over");
		expect(evaluate("seats", 0, 5).state).toBe("over");
	});
});

describe("withinGrace — may new work start?", () => {
	it("allows work under the limit", () => {
		expect(withinGrace(1000, 500)).toBe(true);
	});

	it("allows the action that tips over (grace covers it)", () => {
		expect(withinGrace(1000, 1000)).toBe(true);
		expect(withinGrace(1000, 1099)).toBe(true);
	});

	it("blocks once usage passes the grace ceiling", () => {
		expect(withinGrace(1000, 1100)).toBe(false);
		expect(withinGrace(1000, 9999)).toBe(false);
	});

	it("always allows unlimited plans", () => {
		expect(withinGrace(null, 10 ** 12)).toBe(true);
	});
});

describe("period windows", () => {
	it("counterPeriod spans the calendar month in UTC", () => {
		const { start, end } = counterPeriod(new Date("2026-03-15T12:00:00Z"));
		expect(start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
		expect(end.toISOString()).toBe("2026-04-01T00:00:00.000Z");
	});

	it("counterPeriod rolls December over into the next year", () => {
		const { start, end } = counterPeriod(new Date("2026-12-20T00:00:00Z"));
		expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
		expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
	});

	it("counters use the monthly window, gauges the all-time sentinel", () => {
		expect(
			periodFor("actions", new Date("2026-03-15Z")).start.toISOString(),
		).toBe("2026-03-01T00:00:00.000Z");
		expect(periodFor("storageBytes").start).toEqual(SENTINEL_PERIOD.start);
		expect(periodFor("workspaces").start).toEqual(SENTINEL_PERIOD.start);
	});
});
