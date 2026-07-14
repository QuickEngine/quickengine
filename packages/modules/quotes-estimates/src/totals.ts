const POSTGRES_INTEGER_MAX = 2_147_483_647;
const QUANTITY_SCALE = BigInt(1_000);

export type QuoteLineAmount = {
	quantity: string;
	unitPriceCents: number;
};

export function quoteQuantityToMilli(quantity: string): bigint {
	const [whole, fraction = ""] = quantity.split(".");
	return BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(3, "0"));
}

export function quoteLineTotalCents(line: QuoteLineAmount): number {
	if (
		!Number.isInteger(line.unitPriceCents) ||
		line.unitPriceCents < 0 ||
		line.unitPriceCents > POSTGRES_INTEGER_MAX
	) {
		throw new Error("QUOTE_UNIT_PRICE_INVALID");
	}
	const quantityMilli = quoteQuantityToMilli(line.quantity);
	if (quantityMilli <= BigInt(0)) throw new Error("QUOTE_QUANTITY_INVALID");
	const product = quantityMilli * BigInt(line.unitPriceCents);
	// Quantities carry three decimal places. Half-cent results round up so the same
	// input always produces the same whole-cent snapshot without float drift.
	const total = (product + QUANTITY_SCALE / BigInt(2)) / QUANTITY_SCALE;
	if (total > BigInt(POSTGRES_INTEGER_MAX)) {
		throw new Error("QUOTE_LINE_TOTAL_EXCEEDED");
	}
	return Number(total);
}

export function computeQuoteTotals(
	lines: readonly QuoteLineAmount[],
	taxCents = 0,
) {
	if (
		!Number.isInteger(taxCents) ||
		taxCents < 0 ||
		taxCents > POSTGRES_INTEGER_MAX
	) {
		throw new Error("QUOTE_TAX_INVALID");
	}
	const subtotal = lines.reduce(
		(sum, line) => sum + BigInt(quoteLineTotalCents(line)),
		BigInt(0),
	);
	const total = subtotal + BigInt(taxCents);
	if (
		subtotal > BigInt(POSTGRES_INTEGER_MAX) ||
		total > BigInt(POSTGRES_INTEGER_MAX)
	) {
		throw new Error("QUOTE_TOTAL_EXCEEDED");
	}
	return {
		subtotalCents: Number(subtotal),
		taxCents,
		totalCents: Number(total),
	};
}

export function formatQuoteNumber(
	prefix: string,
	sequence: number,
	revision = 1,
): string {
	const base = `${prefix}-${String(sequence).padStart(4, "0")}`;
	return revision === 1 ? base : `${base}-R${revision}`;
}
