import { describe, expect, it } from "vitest";
import {
	BAND_GAP,
	bandFit,
	HEAT_GAP,
	MIN_PLOT,
	plotHeight,
	ringFit,
	statFit,
} from "./tile-fit";

/** Card body sizes the board actually produces, at 104px rows. */
const BODIES: Array<[string, number, number]> = [
	["1x1", 178, 62],
	["2x1", 408, 62],
	["1x2", 178, 166],
	["2x2", 408, 166],
	["3x2", 638, 166],
	["4x2", 868, 166],
	["2x3", 408, 270],
	["3x3", 638, 270],
	["4x3", 868, 270],
	["4x4", 868, 376],
	["2x4", 408, 376],
];

describe("ringFit", () => {
	it("never stacks inside a wide strip", () => {
		// 🔴 The regression. With no aspect test a 4x2 card drew a small ring
		// centred in a great deal of nothing, which is what "doesn't scale" meant.
		for (const [name, width, height] of BODIES) {
			const fit = ringFit(width, height, { characters: 6 });
			if (fit.layout !== "stacked") continue;
			expect(
				width / height,
				`${name} stacked at ${width}x${height}`,
			).toBeLessThanOrEqual(1.8);
		}
	});

	it("uses most of the height wherever it draws a ring", () => {
		for (const [name, width, height] of BODIES) {
			const fit = ringFit(width, height, { characters: 6 });
			if (fit.dial === 0) continue;
			expect(
				fit.dial / height,
				`${name} ring is only ${((fit.dial / height) * 100).toFixed(0)}% of the height`,
			).toBeGreaterThan(0.6);
		}
	});

	it("grows the ring and the reading with the card", () => {
		const small = ringFit(178, 62, { characters: 6 });
		const large = ringFit(868, 376, { characters: 6 });
		expect(large.dial).toBeGreaterThan(small.dial);
		expect(large.figure).toBeGreaterThan(small.figure);
	});

	it("draws no ring at all rather than one smaller than its own stroke", () => {
		expect(ringFit(60, 24, { characters: 6 }).dial).toBe(0);
		expect(ringFit(0, 0, { characters: 6 }).dial).toBe(0);
	});
});

describe("bandFit", () => {
	/** How much of the box the wrapped year covers. */
	function coverage(width: number, height: number) {
		const { bands, cell } = bandFit(width, height, 53);
		const perBand = Math.ceil(53 / bands);
		const usedWidth = perBand * cell + HEAT_GAP * (perBand - 1);
		const usedHeight =
			7 * bands * cell +
			HEAT_GAP * (7 * bands - bands) +
			BAND_GAP * (bands - 1);
		return {
			bands,
			cell,
			across: usedWidth / width,
			down: usedHeight / height,
		};
	}

	it("fills at least four fifths of one axis at every card size", () => {
		for (const [name, width, height] of BODIES) {
			const cover = coverage(width, height);
			if (cover.cell < 3) continue;
			expect(
				Math.max(cover.across, cover.down),
				`${name} fills only ${(cover.across * 100).toFixed(0)}% across and ${(cover.down * 100).toFixed(0)}% down`,
			).toBeGreaterThan(0.8);
		}
	});

	it("never overflows the box it was given", () => {
		for (const [name, width, height] of BODIES) {
			const cover = coverage(width, height);
			if (cover.cell < 3) continue;
			expect(cover.across, `${name} overflows across`).toBeLessThanOrEqual(
				1.01,
			);
			expect(cover.down, `${name} overflows down`).toBeLessThanOrEqual(1.01);
		}
	});

	it("wraps onto more bands as the card gets taller and narrower", () => {
		expect(bandFit(868, 62, 53).bands).toBe(1);
		expect(bandFit(300, 376, 53).bands).toBeGreaterThan(1);
	});

	it("keeps a single band when splitting buys no extra size", () => {
		// A tie must not split: a year read straight across is more legible.
		const wide = bandFit(868, 130, 53);
		expect(wide.bands).toBe(1);
	});
});

describe("statFit", () => {
	it("grows the figure with the card", () => {
		// 🔴 The regression this whole module exists for: the figure was a fixed
		// 24px, so a card four times the area showed the same small number in the
		// corner of a much larger empty rectangle.
		let last = 0;
		for (const [, width, height] of BODIES) {
			const fit = statFit(width, height, 5, { sub: true });
			expect(fit.value).toBeGreaterThanOrEqual(18);
			last = Math.max(last, fit.value);
		}
		expect(statFit(178, 62, 5, { sub: true }).value).toBeLessThan(last);
	});

	it("never lets a long reading overflow its card", () => {
		// A count of 4 and a revenue total of $1,284,905.50 are the same tile.
		for (const [name, width, height] of BODIES) {
			for (const reading of ["4", "1,284", "$1,284,905.50"]) {
				const fit = statFit(width, height, reading.length, { sub: true });
				const drawn = reading.length * fit.value * 0.62;
				expect(drawn, `${name} clips "${reading}"`).toBeLessThanOrEqual(width);
			}
		}
	});

	it("leaves room for the note lines it was told about", () => {
		for (const [name, width, height] of BODIES) {
			const fit = statFit(width, height, 5, { label: true, sub: true });
			const stack = fit.value + 2 * (fit.note * 1.4 + fit.gap);
			expect(
				stack,
				`${name} overflows with a label and a note`,
			).toBeLessThanOrEqual(height * 1.05);
		}
	});

	it("has a ceiling, so a huge card cannot turn a number into signage", () => {
		expect(statFit(4000, 4000, 3).value).toBeLessThanOrEqual(88);
	});

	it("falls back to something readable before it has been measured", () => {
		// ⚠️ The first render happens before the ResizeObserver reports, so a zero
		// box must not produce a zero figure.
		const fit = statFit(0, 0, 5);
		expect(fit.value).toBeGreaterThan(0);
		expect(fit.note).toBeGreaterThan(0);
	});
});

describe("ringFit, stacked", () => {
	it("never draws a ring taller than the card once its lines are counted", () => {
		// 🔴 The clipped donut. At certain heights the ring plus the two lines
		// under it came to more than the box, and the card cut the bottom off.
		for (const [name, width, height] of BODIES) {
			for (const lines of [1, 2]) {
				const fit = ringFit(width, height, { characters: 6, lines });
				if (fit.layout !== "stacked" || fit.dial === 0) continue;
				const stack = fit.dial + lines * 16 + 10;
				expect(
					stack,
					`${name} clips the ring with ${lines} line(s): ${stack} in ${height}`,
				).toBeLessThanOrEqual(height);
			}
		}
	});

	it("shrinks the ring when a notice adds a second line", () => {
		const one = ringFit(408, 270, { characters: 6, lines: 1 });
		const two = ringFit(408, 270, { characters: 6, lines: 2 });
		expect(two.dial).toBeLessThan(one.dial);
	});
});

describe("plotHeight", () => {
	it("never draws a plot taller than the card it is in", () => {
		for (const [name, width, height] of BODIES) {
			if (height < MIN_PLOT) continue;
			expect(
				plotHeight(width, height),
				`${name} overflows`,
			).toBeLessThanOrEqual(height);
		}
	});

	it("lets a wide card draw a taller chart than a narrow one", () => {
		// 🔴 The fix for the dead space under a chart on a tall card, without
		// bringing back the cliff a narrow tall chart makes of a small move.
		expect(plotHeight(868, 376)).toBeGreaterThan(plotHeight(178, 376));
	});

	it("caps the slope, so a small move cannot be drawn as a cliff", () => {
		expect(plotHeight(200, 400) / 200).toBeLessThanOrEqual(0.62);
	});

	it("has an absolute ceiling as well as an aspect one", () => {
		expect(plotHeight(4000, 4000)).toBeLessThanOrEqual(260);
	});
});

describe("ringFit, the reading and the ring", () => {
	/** What `Ring` actually draws, so the test measures the same circle. */
	const strokeFor = (dial: number) => Math.max(4, Math.round(dial * 0.11));

	it("never lets the reading cross the ring's stroke", () => {
		// 🔴 The one Asher could see: "31,480" and "707 MB" were drawn straight
		// through the ring while "19" fit, because the label was sized off the
		// DIAL rather than off the inner circle it actually sits in.
		for (const [name, width, height] of BODIES) {
			for (const reading of ["1", "19", "31,480", "707 MB", "$1,284,905.50"]) {
				const fit = ringFit(width, height, { characters: reading.length });
				if (!fit.inside) continue;
				const inner = fit.dial - 2 * strokeFor(fit.dial);
				const drawn = reading.length * fit.figure * 0.62;
				expect(
					drawn,
					`${name}: "${reading}" is ${drawn.toFixed(0)}px across an inner circle of ${inner}px`,
				).toBeLessThanOrEqual(inner);
			}
		}
	});

	it("puts a long reading underneath rather than shrinking it to nothing", () => {
		// A ring small enough that a long reading could only fit inside by
		// becoming unreadable must move the reading out, not shrink it.
		const long = ringFit(200, 150, { characters: 13 });
		expect(long.inside).toBe(false);
		expect(long.figure).toBeGreaterThanOrEqual(16);
	});

	it("keeps a short reading inside where there is clearly room", () => {
		expect(ringFit(408, 270, { characters: 2 }).inside).toBe(true);
	});

	it("leaves the ring room for its lines when the reading drops below it", () => {
		for (const [name, width, height] of BODIES) {
			const fit = ringFit(width, height, { characters: 13, lines: 2 });
			if (fit.layout !== "stacked" || fit.dial === 0) continue;
			// ⚠️ The reading only costs height when it is NOT inside the ring.
			const stack =
				fit.dial + (fit.inside ? 0 : fit.figure * 1.3) + 2 * 16 + 12;
			expect(stack, `${name} overflows`).toBeLessThanOrEqual(height * 1.02);
		}
	});
});

describe("ringFit, inline", () => {
	it("fits the reading and every line under it inside the card", () => {
		// 🔴 At one by one the Seats card clipped its figure and pushed "All in
		// use" off the bottom, because the figure was sized off the whole card
		// rather than off what the ring had left.
		for (const [name, width, height] of BODIES) {
			const fit = ringFit(width, height, { characters: 6, lines: 2 });
			if (fit.layout !== "inline") continue;
			const stack = fit.figure + 2 * 16;
			expect(
				stack,
				`${name} clips its lines: ${stack} in ${height}`,
			).toBeLessThanOrEqual(height);
		}
	});

	it("never runs the reading under the ring beside it", () => {
		for (const [name, width, height] of BODIES) {
			const fit = ringFit(width, height, { characters: 8 });
			if (fit.layout !== "inline" || fit.dial === 0) continue;
			const drawn = 8 * fit.figure * 0.62;
			expect(drawn, `${name} overflows the column`).toBeLessThanOrEqual(
				width - fit.dial,
			);
		}
	});
});

describe("statFit, what actually fits", () => {
	/** The stack a card has to hold: the figure's line box plus each note's. */
	const stackOf = (fit: ReturnType<typeof statFit>) =>
		fit.value * 1.12 +
		(fit.label ? fit.note * 1.4 + fit.gap : 0) +
		(fit.sub ? fit.note * 1.4 + fit.gap : 0);

	it("never builds a stack taller than the card", () => {
		// 🔴 Revenue, Orders and Site traffic all showed a sliver of a number at
		// one by one: they split their height with a chart, so each half was about
		// 23px, while the fit had an 18px FLOOR and counted a line as its point
		// size rather than its line box.
		for (const [name, width, height] of BODIES) {
			// Halved, because these tiles share their card with a chart.
			for (const box of [height, Math.floor(height / 2)]) {
				const fit = statFit(width, box, 12, { sub: true });
				expect(
					stackOf(fit),
					`${name} at ${width}x${box} overflows by ${(stackOf(fit) - box).toFixed(0)}px`,
				).toBeLessThanOrEqual(box);
			}
		}
	});

	it("keeps the number and drops the caption when only one fits", () => {
		const tight = statFit(178, 24, 5, { sub: true });
		expect(tight.sub).toBe(false);
		expect(tight.value).toBeGreaterThan(0);
	});

	it("keeps both once there is room", () => {
		const roomy = statFit(408, 166, 5, { sub: true });
		expect(roomy.sub).toBe(true);
	});

	it("never returns a figure wider than the card", () => {
		for (const [name, width, height] of BODIES) {
			const reading = "$1,284,905.50";
			const fit = statFit(width, height, reading.length, { sub: true });
			expect(
				reading.length * fit.value * 0.62,
				`${name} clips a long total`,
			).toBeLessThanOrEqual(width);
		}
	});
});
