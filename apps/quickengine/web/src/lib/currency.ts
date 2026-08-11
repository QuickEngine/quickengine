/**
 * Local-currency DISPLAY for the pricing page.
 *
 * 🔴 THESE ARE APPROXIMATIONS, AND THE PAGE MUST SAY SO. Charging happens in USD
 * — Stripe holds one price per plan and it is denominated in dollars. A visitor
 * in Mexico who sees MX$540 is billed $30 USD, their issuer applies its own FX
 * plus a foreign-transaction fee, and the amount that reaches their statement is
 * never the number on this page. Every rendered figure therefore carries a "≈"
 * and the words "billed in USD". Removing either turns an estimate into a quote
 * we cannot honour, which is a chargeback and, in several of these countries, a
 * consumer-protection problem.
 *
 * ⚠️ RATES GO STALE. They are hardcoded because the alternative is a network
 * call to an FX provider on a marketing page — another request, another failure
 * mode, another third party in the CSP. Hardcoding is the right trade for an
 * estimate, but it is only right while someone checks them.
 *
 * ✅ THE REAL FIX is multi-currency prices in Stripe: one `Price` per currency
 * per plan, charged in the customer's own money at a rate we set. When that
 * exists, this file is deleted and the amounts come from the same place the
 * charge does — which is the only way a displayed price and a billed price
 * cannot disagree. Tracked as a pre-live gate.
 *
 * Last checked: NEVER. Verify before launch.
 */

type Currency = {
	/** ISO 4217, passed straight to `Intl.NumberFormat`. */
	code: string;
	/** Units of this currency per 1 USD. */
	perUsd: number;
	/** Round display to this multiple, so estimates never look like exact quotes. */
	round: number;
};

// Keyed by region subtag, because language does not determine currency — an
// `es-US` speaker pays in dollars and an `en-MX` speaker pays in pesos.
const BY_REGION: Record<string, Currency> = {
	MX: { code: "MXN", perUsd: 17, round: 10 },
	CA: { code: "CAD", perUsd: 1.35, round: 1 },
	GB: { code: "GBP", perUsd: 0.78, round: 1 },
	AU: { code: "AUD", perUsd: 1.5, round: 1 },
	NZ: { code: "NZD", perUsd: 1.65, round: 1 },
	JP: { code: "JPY", perUsd: 150, round: 100 },
	IN: { code: "INR", perUsd: 84, round: 50 },
	BR: { code: "BRL", perUsd: 5.4, round: 5 },
	ZA: { code: "ZAR", perUsd: 18, round: 10 },
	CH: { code: "CHF", perUsd: 0.88, round: 1 },
	// The euro is one currency across many regions, so it is listed per region
	// rather than inferred — guessing which countries are in the eurozone from a
	// locale string is exactly the kind of cleverness that quietly gets Denmark
	// wrong.
	DE: { code: "EUR", perUsd: 0.92, round: 1 },
	FR: { code: "EUR", perUsd: 0.92, round: 1 },
	ES: { code: "EUR", perUsd: 0.92, round: 1 },
	IT: { code: "EUR", perUsd: 0.92, round: 1 },
	NL: { code: "EUR", perUsd: 0.92, round: 1 },
	IE: { code: "EUR", perUsd: 0.92, round: 1 },
	PT: { code: "EUR", perUsd: 0.92, round: 1 },
	AT: { code: "EUR", perUsd: 0.92, round: 1 },
	BE: { code: "EUR", perUsd: 0.92, round: 1 },
	FI: { code: "EUR", perUsd: 0.92, round: 1 },
};

export type LocalPrice = {
	/** Formatted for display, already rounded. */
	text: string;
	/** True when this is a converted estimate rather than the billed amount. */
	estimated: boolean;
	locale: string;
};

/**
 * Resolves the viewer's region. Anything unrecognised falls back to USD, which
 * is always correct because USD is what is actually charged.
 */
function resolve(): { locale: string; currency: Currency | null } {
	if (typeof navigator === "undefined") {
		return { locale: "en-US", currency: null };
	}
	const locale = navigator.language || "en-US";
	// `Intl.Locale` parses the region properly rather than splitting on a dash,
	// which breaks on tags like `zh-Hans-CN` where the second part is a script.
	let region: string | undefined;
	try {
		region = new Intl.Locale(locale).region ?? undefined;
	} catch {
		region = locale.split("-")[1];
	}
	return { locale, currency: region ? (BY_REGION[region] ?? null) : null };
}

export function formatPrice(usd: number): LocalPrice {
	const { locale, currency } = resolve();

	if (!currency) {
		return {
			text: new Intl.NumberFormat(locale, {
				style: "currency",
				currency: "USD",
				maximumFractionDigits: 0,
			}).format(usd),
			estimated: false,
			locale,
		};
	}

	const converted = usd * currency.perUsd;
	// Rounded to a coarse multiple on purpose: "MX$510" reads as a real quote,
	// "MX$500" reads as the estimate it is.
	const rounded = Math.round(converted / currency.round) * currency.round;

	return {
		text: new Intl.NumberFormat(locale, {
			style: "currency",
			currency: currency.code,
			maximumFractionDigits: 0,
		}).format(rounded),
		estimated: true,
		locale,
	};
}
