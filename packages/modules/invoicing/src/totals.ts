// Pure money math for invoices. All amounts are integer cents. Kept DB-free so it
// can be unit-tested in isolation and reused by the UI for live preview.

export type LineItemAmount = {
	quantity: number;
	unitPriceCents: number;
};

/** One line's total: quantity × unit price, in cents. */
export function lineTotalCents(line: LineItemAmount): number {
	return line.quantity * line.unitPriceCents;
}

export type InvoiceTotals = {
	subtotalCents: number;
	taxCents: number;
	totalCents: number;
};

/**
 * Sum line items into subtotal/tax/total. Integer cents throughout, so there's no
 * floating-point drift no matter how many lines.
 */
export function computeInvoiceTotals(
	lines: LineItemAmount[],
	taxCents = 0,
): InvoiceTotals {
	const subtotalCents = lines.reduce(
		(sum, line) => sum + lineTotalCents(line),
		0,
	);
	return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

/** Human invoice number, zero-padded: ("INV", 7) → "INV-0007". */
export function formatInvoiceNumber(prefix: string, seq: number): string {
	return `${prefix}-${String(seq).padStart(4, "0")}`;
}
