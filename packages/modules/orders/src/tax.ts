// ─────────────────────────────────────────────────────────────────────────────
// WHO DECIDES THE TAX.
//
// Same shape as the payment provider seam, and for the same reason: the answer
// is going to change, and the callers should not.
//
// Today it is a flat rate the operator sets. That is genuinely correct for a
// single-jurisdiction business — an Alberta shop selling to Albertans — and
// genuinely wrong for anyone selling across provinces or state lines. Stripe Tax
// or a rate table slots in behind this interface later without touching the
// checkout, the order record, or any existing row.
//
// ⚠️ Tax is CARRIED correctly from day one even while it is computed naively.
// `orders.tax_cents` exists and every total goes through here, so switching the
// calculation later is a swap rather than a migration.
// ─────────────────────────────────────────────────────────────────────────────

export type TaxContext = {
	subtotalCents: number;
	currency: string;
	/**
	 * Where the buyer is, when known. Ignored by the flat-rate calculator and
	 * required by every real one — carried now so adding a jurisdiction-aware
	 * implementation does not change this signature.
	 */
	destination?: {
		country?: string;
		region?: string;
		postalCode?: string;
	};
};

export interface TaxCalculator {
	readonly id: string;
	calculate(context: TaxContext): Promise<number> | number;
}

/**
 * A single rate the operator sets, in basis points.
 *
 * Basis points rather than a percentage float because 5% must be exactly 500,
 * not 0.05000000000000000277. Money arithmetic stays in integers end to end.
 *
 * ⚠️ Rounds DOWN. Over-charging tax by a cent is a number the business then owes
 * a remittance on and cannot easily refund; under-charging by a cent is theirs
 * to absorb. Neither is good, and the second is the smaller problem.
 */
export function flatRateTaxCalculator(basisPoints: number): TaxCalculator {
	return {
		id: `flat:${basisPoints}`,
		calculate({ subtotalCents }) {
			if (basisPoints <= 0 || subtotalCents <= 0) return 0;
			return Math.floor((subtotalCents * basisPoints) / 10_000);
		},
	};
}

/** No tax. The default, and correct for services in many places. */
export const noTaxCalculator: TaxCalculator = {
	id: "none",
	calculate: () => 0,
};

/**
 * The calculator a workspace's settings ask for.
 *
 * Kept as a function rather than a lookup table because the only input today is
 * a number. When a provider-backed calculator arrives it will need credentials
 * and this becomes the place that resolves them.
 */
export function taxCalculatorFor(settings: {
	taxRateBasisPoints?: number;
}): TaxCalculator {
	const rate = settings.taxRateBasisPoints ?? 0;
	return rate > 0 ? flatRateTaxCalculator(rate) : noTaxCalculator;
}
