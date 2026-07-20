/**
 * Shared money/date formatting with a PINNED locale.
 *
 * `Intl.NumberFormat(undefined, …)` means "use the runtime's default locale" — and the
 * server's default (Node/ICU) does not necessarily match the browser's. Server and client
 * then render different text for the same value, which React reports as a hydration
 * mismatch and repairs by throwing away and regenerating the tree.
 *
 * Pinning one locale makes server and client agree by construction. When real i18n
 * arrives, this is the single place that needs to learn about the user's locale — and it
 * must resolve that locale on the SERVER and pass it down, never read it from the browser
 * during render, or the mismatch returns.
 */
export const APP_LOCALE = "en-US";

/** Format integer cents as currency — the money representation used across QuickDash. */
export function formatMoney(cents: number, currency: string): string {
	return new Intl.NumberFormat(APP_LOCALE, {
		style: "currency",
		currency,
	}).format(cents / 100);
}

/** Format a date/timestamp deterministically. */
export function formatDate(
	value: Date | string | number,
	options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
	return new Intl.DateTimeFormat(APP_LOCALE, options).format(new Date(value));
}

/** Format a plain number (counts, quantities) deterministically. */
export function formatNumber(
	value: number,
	options: Intl.NumberFormatOptions = {},
): string {
	return new Intl.NumberFormat(APP_LOCALE, options).format(value);
}
