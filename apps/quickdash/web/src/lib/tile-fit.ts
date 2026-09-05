/**
 * How the two fixed shape tiles fill the box they are given.
 *
 * 🔴 Why this exists. Most cards on this board scale well because charts
 * STRETCH: a line drawn into any rectangle is still a line. Three did not,
 * and they were the three whose content has a fixed shape it cannot leave —
 * a ring is round, a month is seven by six, a year is fifty three by seven.
 * Fitting a fixed shape into an arbitrary box always leaves slack, and each
 * earlier fix moved the slack somewhere else instead of using it.
 *
 * The rule, applied the same way in all three: work out which axis binds, then
 * hand the leftover to something that wants it. The calendar's is in
 * `calendar-fit.ts`; the other two are here.
 */

/* ── The usage ring ──────────────────────────────────────────────────────── */

export type RingFit = {
	/** Stacked puts the ring above the text; inline sets it alongside. */
	layout: "stacked" | "inline";
	/** Ring diameter, or zero when there is no room to draw one. */
	dial: number;
	/** Point size for the reading, wherever it ends up. */
	figure: number;
	/**
	 * Whether the reading sits INSIDE the ring.
	 *
	 * 🔴 False whenever it would not fit. A reading centred in a ring is drawn
	 * across the ring's inner circle, so its width is bounded by the inner
	 * DIAMETER, not by the card: "19" fits a dial that "31,480" and "707 MB"
	 * overlap, at the same size, because they are three times as wide. Sizing the
	 * label off the dial alone put the text straight through the stroke.
	 *
	 * So the label is measured against the inner circle, and when that would make
	 * it too small to read it goes UNDERNEATH the ring at a proper size instead.
	 * Small inside or full size below; never across the stroke.
	 */
	inside: boolean;
};

/** Below this a ring is smaller than the stroke that draws it. */
const MIN_DIAL = 38;
/**
 * How wide a box may get before stacking stops making sense.
 *
 * 🔴 The stacked layout centres a ring, which fills a square and strands half of
 * a wide strip. This was `width >= 190 && height >= 140` with no aspect test at
 * all, so a four wide by two tall card drew a 111px ring in the middle of 868px
 * of nothing.
 */
const STACK_ASPECT = 1.8;
/**
 * The largest ring worth drawing.
 *
 * ⚠️ Deliberately high, and ONE number for both layouts. Separate ceilings of
 * 160 and 320 meant the cap, not the card, decided the size on a large tile and
 * left two fifths of the height empty: a constant doing the work the
 * measurement should have been doing. It exists only so a ring cannot become
 * absurd, never as part of the fit.
 */
const MAX_DIAL = 320;
/** A reading smaller than this inside a ring is not worth the ring. */
const MIN_INSIDE = 14;
/** One line of note text: 11px type on a 1.4 leading, plus its gap. */
const LINE = 16;
/** Average glyph width as a fraction of point size, for tabular digits. */
const GLYPH = 0.62;

/** The stroke `Ring` draws, so the fit can work out what is left inside it. */
const strokeFor = (dial: number) => Math.max(4, Math.round(dial * 0.11));

/** The largest reading that fits across a ring's inner circle. */
function insideFigure(dial: number, characters: number) {
	const inner = dial - 2 * strokeFor(dial);
	// ⚠️ 0.86 of the inner diameter, not all of it: the text sits on the widest
	// chord, and running it to the very edge touches the stroke at the ends.
	return Math.floor((inner * 0.86) / Math.max(1, characters * GLYPH));
}

export function ringFit(
	width: number,
	height: number,
	{
		characters = 3,
		lines = 1,
	}: {
		/** Length of the reading, which decides whether it fits inside the ring. */
		characters?: number;
		/**
		 * Lines of text sitting UNDER the ring: the "of 50,000 requests" line, and
		 * the notice when the meter is full.
		 *
		 * 🔴 Not optional detail. The dial used to be a flat fraction of the height
		 * with nothing set aside for them, so at certain heights the ring plus its
		 * lines came to more than the card and the card clipped the bottom of the
		 * ring. It looked like a rendering bug and it was arithmetic.
		 */
		lines?: number;
	} = {},
): RingFit {
	if (width <= 0 || height <= 0) {
		return { layout: "inline", dial: 0, figure: 15, inside: false };
	}

	const stacked = height >= 132 && width / height <= STACK_ASPECT;
	if (stacked) {
		const dial = Math.floor(
			Math.min(width * 0.82, height - (lines * LINE + 10), MAX_DIAL),
		);
		if (dial < MIN_DIAL) {
			return { layout: "stacked", dial: 0, figure: 18, inside: false };
		}
		/*
		 * 🔴 A PROPORTION of the ring first, and the character fit only ever
		 * shrinks it further.
		 *
		 * Sizing purely to fill the inner circle made short readings enormous:
		 * "19" was drawn half again the size of "707 MB" in an identical card,
		 * purely because it is four characters shorter. Two cards side by side
		 * then disagree about how big a number is, which reads as a mistake even
		 * though each one fits.
		 */
		const fits = Math.min(insideFigure(dial, characters), dial * 0.26, 72);
		if (fits >= MIN_INSIDE) {
			return { layout: "stacked", dial, figure: fits, inside: true };
		}
		/*
		 * Too tight to read inside, so the reading drops below and the ring gives
		 * up the height it needs.
		 *
		 * ⚠️ The reading is sized FIRST and the ring takes what is left. Reserving
		 * a note-sized line for it was wrong by more than twice: a 40px figure is
		 * not a 16px line, and the ring overflowed the card by exactly that.
		 */
		const below = Math.round(
			Math.max(
				16,
				Math.min((width * 0.9) / (characters * GLYPH), height * 0.16, 40),
			),
		);
		const shorter = Math.floor(
			Math.min(
				width * 0.82,
				height - (lines * LINE + below * 1.3 + 12),
				MAX_DIAL,
			),
		);
		return {
			layout: "stacked",
			dial: shorter >= MIN_DIAL ? shorter : 0,
			figure: below,
			inside: false,
		};
	}

	// Wide or short: the ring takes the height and the reading takes the width,
	// so both axes are used instead of one.
	const dial = Math.floor(Math.min(height * 0.92, width * 0.34, MAX_DIAL));
	const drawn = dial >= MIN_DIAL ? dial : 0;
	/* ⚠️ The reading shares the row with the ring, so it is bounded by what is
	   LEFT of the width, and by the height minus every line under it. Sizing it
	   off the whole card clipped the figure and pushed the notice off the bottom
	   on a one by one tile. */
	const column = width - (drawn ? drawn + 12 : 0);
	return {
		layout: "inline",
		dial: drawn,
		/* ⚠️ Divided by the LEADING, and the note lines counted as line boxes.
		   Counting a line as its point size is what pushed "All in use" off the
		   bottom of the Seats card and clipped the figure above it. */
		figure: Math.max(
			10,
			Math.floor(
				Math.min(
					(column * 0.94) / Math.max(1, characters * GLYPH),
					(height - lines * LINE) / 1.12,
					56,
				),
			),
		),
		inside: false,
	};
}

/* ── The traffic heatmap ─────────────────────────────────────────────────── */

export type BandFit = { bands: number; cell: number };

/** The gap between heatmap cells. */
export const HEAT_GAP = 3;
/** Breathing space between one band of weeks and the next. */
export const BAND_GAP = 8;
/** Past this a square stops reading as a day and starts reading as a button. */
const MAX_HEAT_CELL = 34;

/**
 * Wrap a year of weeks onto as many bands as fill the box best.
 *
 * A year is 53 columns by 7 rows: a fixed 7.6 to 1 shape, which fits almost no
 * tile. Letting it run onto a second or third band, the way a paragraph runs
 * onto another line, is what lets one piece of code fill a wide strip, a square
 * and a tall column.
 *
 * ⚠️ Four bands is the ceiling. Past that a band is under three months and the
 * eye stops reading the whole as a year, which is the only thing this chart is
 * for.
 */
export function bandFit(
	width: number,
	height: number,
	columns: number,
): BandFit {
	const cellFor = (bands: number) => {
		const perBand = Math.ceil(columns / bands);
		const byWidth = (width - HEAT_GAP * (perBand - 1)) / perBand;
		const rows = 7 * bands;
		const byHeight =
			(height - BAND_GAP * (bands - 1) - HEAT_GAP * (rows - bands)) / rows;
		return Math.floor(Math.min(byWidth, byHeight, MAX_HEAT_CELL));
	};
	let bands = 1;
	let cell = cellFor(1);
	for (const candidate of [2, 3, 4]) {
		const size = cellFor(candidate);
		// ⚠️ Strictly greater, so a tie keeps FEWER bands. A year read straight
		// across is more legible than the same year split, and on a tie the split
		// buys nothing.
		if (size > cell) {
			cell = size;
			bands = candidate;
		}
	}
	return { bands, cell };
}

/* ── The number cards ────────────────────────────────────────────────────── */

export type StatFit = {
	/** Point size for the reading itself. */
	value: number;
	/** Point size for the label above and the note below. */
	note: number;
	/** Space between the reading and its note. */
	gap: number;
	/** Whether the label above the reading fits. */
	label: boolean;
	/** Whether the note under the reading fits. */
	sub: boolean;
};

/**
 * The largest a single figure may become.
 *
 * ⚠️ A cap, not part of the fit: it stops a four by four card turning one
 * number into signage. Everything below it is measurement.
 */
const MAX_FIGURE = 88;
/** Below this a figure is smaller than the note under it, which reads as a bug. */
const MIN_FIGURE = 13;
/** `leading-none` still leaves a little above and below the glyphs. */
const LEADING = 1.12;
/** A note line box: its own leading, which is looser than the figure's. */
const NOTE_LEADING = 1.4;

/**
 * Size a single figure to the card it is standing in.
 *
 * 🔴 This is the one that made every count card look broken. `Stat` set 24px
 * type and 11.5px notes whatever the card was, so making a card four times
 * bigger produced the same small number in the corner of a much larger empty
 * rectangle. It is the most common tile on the board, so it was also the most
 * visible failure.
 *
 * 🔴 And then the first fix CLIPPED the cards that share their space. A tile
 * holding a figure and a chart splits the height between them, so at one by one
 * each gets about 23px, while the fit had an 18px floor and counted a line as
 * its point size rather than its LINE BOX. The stack came to 37px inside 23 and
 * `overflow-hidden` cut it in half. Revenue, Orders and Site traffic all showed
 * a sliver of a number.
 *
 * So the fit can no longer overflow by construction: it counts real line boxes,
 * and when the notes will not fit it DROPS them rather than shrinking the figure
 * into illegibility. A card too small for the caption still shows the number,
 * which is the thing you glanced at.
 *
 * ⚠️ Sized from BOTH axes and from the length of the reading. Height alone
 * overflows the moment a number reaches seven figures, and a currency total with
 * a thousands separator is far wider than a count of four.
 */
export function statFit(
	width: number,
	height: number,
	characters: number,
	{ label = false, sub = false }: { label?: boolean; sub?: boolean } = {},
): StatFit {
	if (width <= 0 || height <= 0) {
		return { value: 24, note: 11.5, gap: 6, label, sub };
	}

	/* The notes grow too, but gently: they are captions, and a caption in the
	   same weight as its figure competes with it. */
	const note = Math.round(
		Math.max(10, Math.min(width * 0.05, height * 0.09, 17)),
	);
	const gap = Math.round(Math.max(3, Math.min(note * 0.6, 12)));
	/* 0.62 of the point size per character is a safe average for tabular digits
	   with separators; narrower clips a wide total, wider wastes the card. */
	const byWidth = (width * 0.94) / Math.max(1, characters * GLYPH);

	/**
	 * Try the full stack, then give up the note, then the label. Each line costs
	 * its LINE BOX plus the gap above it, which is what the earlier version got
	 * wrong.
	 */
	for (const [keepLabel, keepSub] of [
		[label, sub],
		[label, false],
		[false, false],
	] as Array<[boolean, boolean]>) {
		const lines = (keepLabel ? 1 : 0) + (keepSub ? 1 : 0);
		const spare = height - lines * (note * NOTE_LEADING + gap);
		const value = Math.min(spare / LEADING, byWidth, MAX_FIGURE);
		if (value >= MIN_FIGURE || (!keepLabel && !keepSub)) {
			return {
				/* ⚠️ Floored at 1, never at a readable minimum: a floor above what
				   fits is exactly how the old one overflowed. A card this small has
				   already dropped its notes, and the figure shrinking is the honest
				   last step before the card admits it cannot show anything. */
				value: Math.max(1, Math.floor(value)),
				note,
				gap,
				label: keepLabel,
				sub: keepSub,
			};
		}
	}
	return { value: MIN_FIGURE, note, gap, label: false, sub: false };
}

/* ── The series charts ───────────────────────────────────────────────────── */

/** Under this a plot is a smear rather than a chart. */
export const MIN_PLOT = 44;
/** An absolute ceiling, so an enormous card does not draw an enormous chart. */
const MAX_PLOT = 260;
/**
 * The tallest a plot may be RELATIVE to its own width.
 *
 * 🔴 The absolute ceiling alone left a tall card drawing a 260px chart with the
 * rest of itself empty, which is the same "does not scale" complaint. Removing
 * it brings back the reason it exists: a two percent move stretched over 400px
 * of height reads as a cliff.
 *
 * An aspect ceiling answers both, because slope is a RATIO. 900 by 400 is not a
 * cliff; 200 by 400 is. So a wide card may draw a taller chart, a narrow one may
 * not, and the plot fills a large card without ever exaggerating.
 */
const MAX_PLOT_ASPECT = 0.62;

/**
 * How tall a series plot may be inside the box it was given.
 *
 * ⚠️ Never taller than the box. The floor only applies where the caller has
 * already established the box clears `MIN_PLOT`.
 */
export function plotHeight(width: number, height: number) {
	const byAspect = width > 0 ? width * MAX_PLOT_ASPECT : height;
	return Math.round(Math.max(MIN_PLOT, Math.min(height, MAX_PLOT, byAspect)));
}
