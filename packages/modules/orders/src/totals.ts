export type OrderLineAmount = {
	quantity: number;
	unitPriceCents: number;
};

export function orderLineTotalCents(line: OrderLineAmount): number {
	return line.quantity * line.unitPriceCents;
}

/**
 * Sum lines into subtotal, tax and total. Integer cents throughout, so no
 * number of lines can introduce floating-point drift.
 *
 * ⚠️ `taxCents` is supplied, never derived here. Deciding the amount belongs to
 * a `TaxCalculator` (`./tax.ts`); this function only does arithmetic, which is
 * what makes it safe to unit test and reuse for a live total in the UI.
 */
export function computeOrderTotals(
	lines: readonly OrderLineAmount[],
	taxCents = 0,
) {
	const subtotalCents = lines.reduce(
		(sum, line) => sum + orderLineTotalCents(line),
		0,
	);
	// Never let a negative tax reduce a total — that is a discount wearing the
	// wrong name, and it would understate what the business owes on remittance.
	const tax = Math.max(0, Math.trunc(taxCents));
	return { subtotalCents, taxCents: tax, totalCents: subtotalCents + tax };
}

export function formatOrderNumber(prefix: string, sequence: number): string {
	return `${prefix}-${String(sequence).padStart(4, "0")}`;
}
