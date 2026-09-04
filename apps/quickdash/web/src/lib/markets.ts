/**
 * A price feed for the watchlist tile.
 *
 * ── Why Binance, and why no key ──────────────────────────────────────────────
 *
 * 🔑 The public market endpoints need no account, no key and no signature, and
 * they return OHLC directly — which is exactly the shape `Candles` already
 * draws. Asher's requirement was that it cost nothing and look like ours; a
 * keyless read of public data satisfies the first and drawing it ourselves
 * satisfies the second.
 *
 * ⚠️ Called from the BROWSER, deliberately. A price feed is public data with no
 * secret to protect, so routing it through our API would add a hop, a cache to
 * invalidate and a rate limit that is ours rather than theirs, for no privacy
 * gained. If that changes — a paid tier, a key, per-workspace holdings — it
 * moves server side and this module is the only thing that changes.
 *
 * 🔴 It is NOT financial advice, a portfolio, or a place to trade. It watches a
 * price. Anything that moves money belongs nowhere near a dashboard tile.
 */

const BASE = "https://api.binance.com/api/v3";

export type Watched = {
	/** The pair as Binance names it, e.g. `BTCUSDT`. */
	symbol: string;
	/** What a person calls it, e.g. `BTC`. */
	name: string;
};

export type Quote = {
	symbol: string;
	price: number;
	changePercent: number;
};

export type Bar = {
	/** Epoch SECONDS, which is what the chart library expects. */
	time: number;
	label: string;
	open: number;
	high: number;
	low: number;
	close: number;
};

/** The default watchlist, until somebody edits it. */
export const DEFAULT_WATCHLIST: Watched[] = [
	{ symbol: "BTCUSDT", name: "BTC" },
	{ symbol: "ETHUSDT", name: "ETH" },
	{ symbol: "SOLUSDT", name: "SOL" },
];

const WATCHLIST_KEY = "quickdash.watchlist";

export function readWatchlist(): Watched[] {
	try {
		const raw = localStorage.getItem(WATCHLIST_KEY);
		if (!raw) return DEFAULT_WATCHLIST;
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WATCHLIST;
		return parsed.filter(
			(entry): entry is Watched =>
				!!entry &&
				typeof entry === "object" &&
				typeof (entry as Watched).symbol === "string",
		);
	} catch {
		return DEFAULT_WATCHLIST;
	}
}

export function writeWatchlist(list: Watched[]) {
	try {
		localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
	} catch {
		// It applies for this session and simply is not remembered.
	}
}

export async function fetchQuote(symbol: string): Promise<Quote> {
	const response = await fetch(
		`${BASE}/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
	);
	if (!response.ok) throw new Error(`That symbol could not be read.`);
	const body = (await response.json()) as {
		lastPrice: string;
		priceChangePercent: string;
	};
	return {
		symbol,
		price: Number(body.lastPrice),
		changePercent: Number(body.priceChangePercent),
	};
}

/**
 * Candles for a symbol.
 *
 * ⚠️ Binance answers with ARRAYS, not objects: `[openTime, open, high, low,
 * close, …]`. Indexing into a positional response is exactly the kind of thing
 * that breaks silently, so the shape is named here once rather than at the call
 * site.
 */
export async function fetchBars(
	symbol: string,
	interval: string,
	limit: number,
): Promise<Bar[]> {
	const response = await fetch(
		`${BASE}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
	);
	if (!response.ok) throw new Error("That price history could not be read.");
	const rows = (await response.json()) as Array<
		[number, string, string, string, string, ...unknown[]]
	>;
	return rows.map(([openTime, open, high, low, close]) => ({
		// ⚠️ SECONDS. Binance answers in milliseconds and the chart library wants
		// seconds; getting this wrong puts every candle in 1970 with no error.
		time: Math.floor(openTime / 1000),
		label: new Date(openTime).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		}),
		open: Number(open),
		high: Number(high),
		low: Number(low),
		close: Number(close),
	}));
}

/** How Binance names the bucket for a given number of days on the board. */
export const intervalFor = (days: number) =>
	days <= 7 ? "1h" : days <= 30 ? "4h" : "1d";

/**
 * 🔴 Far MORE than the window shows, on purpose.
 *
 * The chart is a view onto a series that can be panned and zoomed, so fetching
 * exactly what fits means panning left runs out of chart immediately. Binance
 * caps a request at 1000 candles and charges the same weight for one as for a
 * thousand, so there is no reason to ask for less: one request buys the whole
 * history somebody can scroll through.
 */
export const barsFor = (_days: number) => 1000;
