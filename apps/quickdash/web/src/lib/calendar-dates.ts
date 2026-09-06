/**
 * The date arithmetic behind the calendar, kept apart from the component.
 *
 * 🔴 Every function here works in LOCAL time. `startsAt` arrives as an ISO
 * string carrying an offset, and reading its UTC parts puts an eight in the
 * evening appointment on tomorrow for anyone west of Greenwich. A calendar that
 * shows the wrong day is worse than no calendar, because it is believed.
 */

/**
 * The first day of the week, as the reader's own region writes it.
 *
 * ⚠️ Hard coding Monday is wrong for North America and hard coding Sunday is
 * wrong for most of Europe. `weekInfo` answers it properly and is missing in
 * older browsers, so it falls back to Sunday rather than throwing.
 *
 * `weekInfo` counts Monday as 1 through Sunday as 7; JavaScript counts Sunday
 * as 0, which is why the result is taken modulo seven.
 */
export function firstWeekday(language?: string): number {
	try {
		const tag =
			language ??
			(typeof navigator === "undefined" ? "en-US" : navigator.language);
		const locale = new Intl.Locale(tag) as Intl.Locale & {
			weekInfo?: { firstDay?: number };
			getWeekInfo?: () => { firstDay: number };
		};
		const info =
			typeof locale.getWeekInfo === "function"
				? locale.getWeekInfo()
				: locale.weekInfo;
		const first = info?.firstDay;
		return typeof first === "number" ? first % 7 : 0;
	} catch {
		return 0;
	}
}

export const startOfMonth = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), 1);

export const addMonths = (date: Date, step: number) =>
	new Date(date.getFullYear(), date.getMonth() + step, 1);

/** A local `YYYY-MM-DD`, which is what every lookup in the calendar is keyed by. */
export function dayKey(date: Date) {
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Whole weeks covering the month: always six rows, so the grid never changes
 * height as you page through the year and the tile below it never jumps.
 *
 * ⚠️ Built by adding days to a copy, not by `setDate` on one date, and never by
 * adding milliseconds. A day is not always 86,400,000 ms: on the two days a year
 * a region changes clock, arithmetic in milliseconds lands an hour off and the
 * grid repeats or skips a date.
 */
export function weeksFor(month: Date, firstDay: number) {
	const first = startOfMonth(month);
	const lead = (first.getDay() - firstDay + 7) % 7;
	return Array.from({ length: 42 }, (_, index) => {
		const day = new Date(first);
		day.setDate(first.getDate() - lead + index);
		return day;
	});
}

/** The seven column headings, in the reader's own order and language. */
export function weekdayLabels(firstDay: number, language?: string) {
	return Array.from({ length: 7 }, (_, index) => {
		/** Any Sunday will do as an anchor; 2024-01-07 was one. */
		const day = new Date(2024, 0, 7 + ((firstDay + index) % 7));
		return {
			full: day.toLocaleDateString(language, { weekday: "long" }),
			/** "Mon". Used once a cell is wide enough to hold three letters. */
			short: day.toLocaleDateString(language, { weekday: "short" }),
			/** "M". The fallback for the smallest cells that still show a grid. */
			narrow: day.toLocaleDateString(language, { weekday: "narrow" }),
		};
	});
}
