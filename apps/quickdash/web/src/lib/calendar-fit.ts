/**
 * How a calendar fills the box it is given.
 *
 * 🔴 Pulled out and tested because "it does not scale nicely" was the same
 * complaint three times, and each fix moved the stranded space somewhere else
 * instead of removing it.
 *
 * The month is seven columns by six rows plus a label row: a fixed shape near
 * 7:7. A tile is almost never that shape, so fitting squares inside it always
 * leaves slack on one axis. The charts on this board do not have the problem
 * because they STRETCH; a calendar cannot stretch without becoming unreadable.
 *
 * So the slack is given to something that wants it rather than left as margin:
 *
 * · height bound, and the leftover width is wide enough to read: the day list
 *   moves BESIDE the grid, which is what a wide calendar looks like anywhere.
 * · height bound with a little leftover width: the cells widen, up to a quarter
 *   again, which soaks up a few dozen pixels without reading as stretched.
 * · width bound: the list goes UNDERNEATH and takes the leftover height.
 * · too small for either: no grid at all, just what is coming up.
 */
export type CalendarFit = {
	mode: "grid" | "agenda";
	/** Cell width and height, equal unless the cells were widened to fill. */
	cell: { width: number; height: number };
	/** Where the day list sits, or `none` when there is no room for one. */
	list: "beside" | "below" | "none";
	/** The width the list gets when it sits beside the grid. */
	listWidth: number;
};

/** The weekday label row, a font metric rather than a layout one. */
export const WEEKDAY_ROW = 15;
/** The gap between day cells. */
export const GAP = 2;
/** Below this a cell cannot hold a legible date. */
const MIN_CELL = 20;
/** A list narrower than this is a column of ellipses. */
const MIN_LIST = 150;
/** Under this height a list shows one line and a half. */
const MIN_LIST_HEIGHT = 96;
/** How far a cell may depart from square to soak up leftover width. */
const MAX_STRETCH = 1.25;

export function calendarFit(width: number, height: number): CalendarFit {
	const none: CalendarFit = {
		mode: "agenda",
		cell: { width: 0, height: 0 },
		list: "none",
		listWidth: 0,
	};
	if (width <= 0 || height <= 0) return none;

	/**
	 * The tallest square cell that fits the full height, and the widest that
	 * fits the full width. Which one binds decides the whole layout.
	 */
	const byHeight = (height - WEEKDAY_ROW - 6 * GAP) / 6;
	const byWidth = (width - 6 * GAP) / 7;

	if (byHeight <= byWidth) {
		// Height bound: the grid cannot grow taller, so the leftover is WIDTH.
		const cell = Math.floor(byHeight);
		if (cell < MIN_CELL) return none;
		const gridWidth = cell * 7 + GAP * 6;
		const leftover = width - gridWidth;
		if (leftover >= MIN_LIST) {
			return {
				mode: "grid",
				cell: { width: cell, height: cell },
				list: "beside",
				// ⚠️ The list takes the leftover MINUS a gutter, not all of it, so
				// the two halves are separated rather than touching.
				listWidth: leftover - 12,
			};
		}
		// Not enough for a list, so the cells themselves take the slack.
		const widened = Math.floor(Math.min(cell * MAX_STRETCH, byWidth));
		return {
			mode: "grid",
			cell: { width: widened, height: cell },
			list: "none",
			listWidth: 0,
		};
	}

	// Width bound: the leftover is HEIGHT, which is what a list underneath wants.
	const cell = Math.floor(byWidth);
	if (cell < MIN_CELL) return none;
	const gridHeight = cell * 6 + GAP * 5 + WEEKDAY_ROW;
	const leftover = height - gridHeight;
	return {
		mode: "grid",
		cell: { width: cell, height: cell },
		list: leftover >= MIN_LIST_HEIGHT ? "below" : "none",
		listWidth: 0,
	};
}
