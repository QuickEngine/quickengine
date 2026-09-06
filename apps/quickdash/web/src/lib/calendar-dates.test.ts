import { describe, expect, it } from "vitest";
import {
	addMonths,
	dayKey,
	firstWeekday,
	startOfMonth,
	weekdayLabels,
	weeksFor,
} from "./calendar-dates";

describe("dayKey", () => {
	it("reads LOCAL parts, so a late evening never lands on tomorrow", () => {
		// 23:30 local on the 4th. Read as UTC anywhere west of Greenwich this is
		// already the 5th, which is the bug the whole module exists to avoid.
		expect(dayKey(new Date(2026, 8, 4, 23, 30))).toBe("2026-09-04");
		expect(dayKey(new Date(2026, 8, 4, 0, 1))).toBe("2026-09-04");
	});

	it("pads month and day so keys sort and compare as strings", () => {
		expect(dayKey(new Date(2026, 0, 1))).toBe("2026-01-01");
		expect(dayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
	});
});

describe("addMonths", () => {
	it("crosses a year in both directions", () => {
		expect(dayKey(addMonths(new Date(2026, 11, 1), 1))).toBe("2027-01-01");
		expect(dayKey(addMonths(new Date(2026, 0, 1), -1))).toBe("2025-12-01");
	});

	it("does not roll a long month into the one after next", () => {
		// The classic: the 31st of January plus a month. Anchoring on the FIRST
		// is what keeps this from producing March.
		expect(dayKey(addMonths(startOfMonth(new Date(2026, 0, 31)), 1))).toBe(
			"2026-02-01",
		);
	});
});

describe("weeksFor", () => {
	it("always returns six whole weeks, so the grid never changes height", () => {
		for (let month = 0; month < 12; month += 1) {
			expect(weeksFor(new Date(2026, month, 1), 0)).toHaveLength(42);
		}
	});

	it("starts on the requested first weekday", () => {
		for (const firstDay of [0, 1, 6]) {
			const grid = weeksFor(new Date(2026, 8, 1), firstDay);
			expect(grid[0].getDay()).toBe(firstDay);
		}
	});

	it("covers every day of the month it was asked for", () => {
		const grid = weeksFor(new Date(2026, 8, 1), 0);
		const keys = new Set(grid.map(dayKey));
		for (let day = 1; day <= 30; day += 1) {
			expect(keys.has(dayKey(new Date(2026, 8, day)))).toBe(true);
		}
	});

	it("runs consecutively with no repeated or skipped day", () => {
		// 🔴 The daylight-saving trap. March 2026 contains a clock change in most
		// of North America and Europe; adding 86,400,000 ms per cell repeats or
		// skips a date across it and the grid quietly goes wrong for one month a
		// year. Checked across a whole year so no month is special-cased.
		for (let month = 0; month < 12; month += 1) {
			const grid = weeksFor(new Date(2026, month, 1), 0);
			const keys = grid.map(dayKey);
			expect(new Set(keys).size).toBe(42);
			for (let index = 1; index < grid.length; index += 1) {
				const expected = new Date(grid[0]);
				expected.setDate(grid[0].getDate() + index);
				expect(keys[index]).toBe(dayKey(expected));
			}
		}
	});

	it("leads with the tail of the previous month rather than blanks", () => {
		// 2026-09-01 is a Tuesday, so a Sunday-first grid opens on 30 August.
		const grid = weeksFor(new Date(2026, 8, 1), 0);
		expect(dayKey(grid[0])).toBe("2026-08-30");
	});
});

describe("firstWeekday", () => {
	it("answers within the week and never throws on a nonsense tag", () => {
		for (const tag of ["en-US", "en-GB", "de-DE", "fr-FR", "ar-EG"]) {
			const day = firstWeekday(tag);
			expect(Number.isInteger(day)).toBe(true);
			expect(day).toBeGreaterThanOrEqual(0);
			expect(day).toBeLessThanOrEqual(6);
		}
		expect(firstWeekday("not a locale")).toBe(0);
	});
});

describe("weekdayLabels", () => {
	it("labels seven distinct days starting where asked", () => {
		const labels = weekdayLabels(1, "en-US");
		expect(labels).toHaveLength(7);
		expect(labels[0].full).toBe("Monday");
		expect(labels[6].full).toBe("Sunday");
		expect(labels[0].short).toBe("Mon");
		expect(labels[0].narrow).toBe("M");
		expect(new Set(labels.map((label) => label.full)).size).toBe(7);
	});
});
