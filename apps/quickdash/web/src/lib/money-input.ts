/**
 * Read an amount a person typed.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 `Number("$12.00")` is `NaN`, and every money field in the console used
 * `Number()` directly. So typing a currency symbol — which is what essentially
 * everybody does, because that is how prices are written everywhere else —
 * silently disabled the submit button with nothing on screen explaining why.
 * The form looked broken and the person looked wrong.
 *
 * Accepts what people actually type: `$12.00`, `12`, `1,299.99`, `£4.50`,
 * ` 12.00 `, and `12.00 CAD`. Rejects only genuine nonsense.
 *
 * ⚠️ Returns null rather than 0 for unparseable input. Zero is a legitimate
 * price — free shipping, a 0% introductory discount — so conflating "nothing
 * typed yet" with "deliberately free" would let an empty field save as free.
 */
export function parseAmount(value: string): number | null {
	// Strip currency symbols, thousands separators, spaces and trailing codes,
	// keeping digits, one decimal point and a leading minus.
	const cleaned = value.replace(/[^\d.-]/g, "");
	if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
	const parsed = Number(cleaned);
	return Number.isFinite(parsed) ? parsed : null;
}

/** The same amount as integer minor units, or null if it cannot be read. */
export function parseAmountCents(value: string): number | null {
	const amount = parseAmount(value);
	// 🔑 Rounded, not truncated: `12.005` typed by a human means 12.01, and
	// `Math.trunc` would quietly take a penny off every such price.
	return amount === null ? null : Math.round(amount * 100);
}

/** True when a field holds something that can be read as an amount. */
export const isAmount = (value: string): boolean => parseAmount(value) !== null;
