export type OrderLineAmount = {
	quantity: number;
	unitPriceCents: number;
};

export function orderLineTotalCents(line: OrderLineAmount): number {
	return line.quantity * line.unitPriceCents;
}

export function computeOrderTotals(lines: readonly OrderLineAmount[]) {
	const subtotalCents = lines.reduce(
		(sum, line) => sum + orderLineTotalCents(line),
		0,
	);
	return { subtotalCents, totalCents: subtotalCents };
}

export function formatOrderNumber(prefix: string, sequence: number): string {
	return `${prefix}-${String(sequence).padStart(4, "0")}`;
}
