/**
 * Exchange rates, fetched on the SERVER and cached.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 A storefront was calling a free public rate API straight from the browser.
 * It is CORS-blocked, so every request failed and the shop silently fell back to
 * a hardcoded `0.70` — meaning every price shown in a second currency was an
 * invented number that never changed. Worse, the shop then charged in the
 * catalog's currency anyway, so somebody agreed to one figure and was billed
 * another.
 *
 * 🔑 Server-side means no CORS, one cached call shared by every visitor instead
 * of one per browser, and a single rate that pricing and display both read — so
 * the number on the button cannot disagree with the number charged.
 *
 * ⚠️ Rates are CACHED, not stored per order. What an order was actually charged
 * is recorded on the order in its own currency; this is only for quoting.
 */

/** How long a rate is trusted. Long enough to be cheap, short enough to be current. */
const CACHE_MS = 60 * 60 * 1000;

type CacheEntry = { rate: number; fetchedAt: number };
const cache = new Map<string, CacheEntry>();

const key = (from: string, to: string) =>
	`${from.toUpperCase()}:${to.toUpperCase()}`;

export class ExchangeRateError extends Error {}

/**
 * How many units of `to` one unit of `from` buys.
 *
 * 🔴 Throws rather than falling back to a guess. A wrong rate is worse than no
 * rate: it produces a confident, plausible, incorrect price. A caller that
 * cannot get a rate must show one currency rather than a made-up conversion.
 */
export async function exchangeRate(
	from: string,
	to: string,
): Promise<{ rate: number; asOf: Date }> {
	const a = from.toUpperCase();
	const b = to.toUpperCase();
	if (a === b) return { rate: 1, asOf: new Date() };

	const cached = cache.get(key(a, b));
	if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
		return { rate: cached.rate, asOf: new Date(cached.fetchedAt) };
	}

	let response: Response;
	try {
		response = await fetch(
			`https://api.frankfurter.app/latest?from=${a}&to=${b}`,
			// A shop must not hang because a rate service is slow.
			{ signal: AbortSignal.timeout(5000) },
		);
	} catch {
		// Serve a stale rate rather than nothing — an hour-old rate is far closer
		// to the truth than refusing to show a price at all.
		if (cached) return { rate: cached.rate, asOf: new Date(cached.fetchedAt) };
		throw new ExchangeRateError("RATE_UNAVAILABLE");
	}

	if (!response.ok) {
		if (cached) return { rate: cached.rate, asOf: new Date(cached.fetchedAt) };
		throw new ExchangeRateError("RATE_UNAVAILABLE");
	}

	const body = (await response.json()) as { rates?: Record<string, number> };
	const rate = body.rates?.[b];
	if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
		if (cached) return { rate: cached.rate, asOf: new Date(cached.fetchedAt) };
		throw new ExchangeRateError("RATE_UNAVAILABLE");
	}

	const fetchedAt = Date.now();
	cache.set(key(a, b), { rate, fetchedAt });
	return { rate, asOf: new Date(fetchedAt) };
}

/**
 * Convert an integer-cent amount.
 *
 * ⚠️ Rounds HALF UP on the total the customer pays, so a conversion can never
 * quietly shave a cent off what the shop receives. Applied to whole amounts
 * rather than per line, because converting each line and summing drifts from
 * converting the sum.
 */
export function convertCents(amountCents: number, rate: number): number {
	return Math.round(amountCents * rate);
}
