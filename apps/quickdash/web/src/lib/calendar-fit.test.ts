import { describe, expect, it } from "vitest";
import { calendarFit, GAP, WEEKDAY_ROW } from "./calendar-fit";

/** How much of the box the calendar actually covers, both axes. */
function coverage(width: number, height: number) {
	const fit = calendarFit(width, height);
	if (fit.mode === "agenda") return null;
	const gridWidth = fit.cell.width * 7 + GAP * 6;
	const gridHeight = fit.cell.height * 6 + GAP * 5 + WEEKDAY_ROW;
	const usedWidth =
		fit.list === "beside" ? gridWidth + 12 + fit.listWidth : gridWidth;
	return { across: usedWidth / width, down: gridHeight / height, fit };
}

/** The tile sizes the board can actually produce, at 104px rows. */
const TILES: Array<[string, number, number]> = [
	["1x1", 210, 84],
	["2x1", 440, 84],
	["1x2", 210, 190],
	["2x2", 440, 190],
	["3x2", 670, 190],
	["4x2", 900, 190],
	["2x3", 440, 296],
	["3x3", 670, 296],
	["4x3", 900, 296],
	["4x4", 900, 402],
	["2x4", 440, 402],
];

describe("calendarFit", () => {
	it("never strands a whole band of empty space across the box", () => {
		// 🔴 This is the regression. Every earlier version passed some sizes and
		// left 40 percent of the card blank at others, which is what "doesn't
		// scale nicely" meant. A grid that draws at all must use most of its box.
		for (const [name, width, height] of TILES) {
			const cover = coverage(width, height);
			if (!cover) continue;
			expect(
				cover.across,
				`${name} covers only ${(cover.across * 100).toFixed(0)}% across`,
			).toBeGreaterThan(0.8);
		}
	});

	it("uses most of the height wherever it draws a grid", () => {
		for (const [name, width, height] of TILES) {
			const cover = coverage(width, height);
			if (!cover) continue;
			expect(
				cover.down,
				`${name} covers only ${(cover.down * 100).toFixed(0)}% down`,
			).toBeGreaterThan(0.8);
		}
	});

	it("puts the list beside the grid only when it is wide enough to read", () => {
		const wide = calendarFit(900, 190);
		expect(wide.list).toBe("beside");
		expect(wide.listWidth).toBeGreaterThanOrEqual(150);
	});

	it("puts the list underneath when the leftover is height, not width", () => {
		expect(calendarFit(300, 500).list).toBe("below");
	});

	it("keeps cells square unless it is widening them to fill", () => {
		const square = calendarFit(300, 500).cell;
		expect(square.width).toBe(square.height);
		const stretched = calendarFit(440, 190).cell;
		expect(stretched.width).toBeGreaterThanOrEqual(stretched.height);
		// ⚠️ A quarter again is the ceiling. Past that the squares read as bricks
		// and the month stops looking like a calendar.
		expect(stretched.width / stretched.height).toBeLessThanOrEqual(1.25);
	});

	it("gives up rather than drawing a grid nobody can read", () => {
		expect(calendarFit(210, 84).mode).toBe("agenda");
		expect(calendarFit(0, 0).mode).toBe("agenda");
		expect(calendarFit(120, 120).mode).toBe("agenda");
	});
});
