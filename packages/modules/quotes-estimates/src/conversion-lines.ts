import { normalizeQuoteQuantity } from "./quote";
import { quoteQuantityToMilli } from "./totals";

export type QuoteEstimateConversionLine = {
	id: string;
	catalogItemId: string | null;
	catalogItemVariantId: string | null;
	variantOptions: Array<{ name: string; value: string }>;
	name: string;
	description: string | null;
	itemType: "physical" | "digital" | "service" | "package" | "rental";
	sku: string | null;
	quantity: string;
	unitLabel: string | null;
	unitPriceCents: number;
	lineTotalCents: number;
	position: number;
	metadata: Record<string, unknown>;
};

const QUANTITY_SCALE = BigInt(1_000);
const MAX_ORDER_QUANTITY = 1_000_000;
const QUOTES_ESTIMATES_SOURCE = "quotes-estimates";

function lineDescription(
	line: QuoteEstimateConversionLine,
	flattenedQuantity: boolean,
) {
	const base = line.description
		? `${line.name}: ${line.description}`
		: line.name;
	if (!line.unitLabel) return base;
	const quantity = normalizeQuoteQuantity(line.quantity);
	return flattenedQuantity
		? `${base} (${quantity} ${line.unitLabel})`
		: `${base} (${line.unitLabel})`;
}

export function invoiceLineFromQuoteEstimateLine(
	line: QuoteEstimateConversionLine,
) {
	const quantityMilli = quoteQuantityToMilli(line.quantity);
	const wholeQuantity = quantityMilli % QUANTITY_SCALE === BigInt(0);
	const quantity = Number(quantityMilli / QUANTITY_SCALE);
	if (wholeQuantity && quantity <= MAX_ORDER_QUANTITY) {
		return {
			description: lineDescription(line, false),
			quantity,
			unitPriceCents: line.unitPriceCents,
			sourceModule: QUOTES_ESTIMATES_SOURCE,
			sourceRecordId: line.id,
			position: line.position,
		};
	}
	// Invoices currently store whole quantities. Preserve the exact quoted quantity
	// in the description and flatten only the invoice line amount; the quote remains
	// the authoritative fractional-price snapshot.
	return {
		description: lineDescription(line, true),
		quantity: 1,
		unitPriceCents: line.lineTotalCents,
		sourceModule: QUOTES_ESTIMATES_SOURCE,
		sourceRecordId: line.id,
		position: line.position,
	};
}

export function orderLineFromQuoteEstimateLine(
	line: QuoteEstimateConversionLine,
) {
	const quantityMilli = quoteQuantityToMilli(line.quantity);
	if (quantityMilli % QUANTITY_SCALE !== BigInt(0)) {
		throw new Error("QUOTE_ORDER_REQUIRES_WHOLE_QUANTITIES");
	}
	const quantity = Number(quantityMilli / QUANTITY_SCALE);
	if (quantity > MAX_ORDER_QUANTITY) {
		throw new Error("QUOTE_ORDER_QUANTITY_EXCEEDED");
	}
	return {
		catalogItemId: line.catalogItemId,
		catalogItemVariantId: line.catalogItemVariantId,
		variantOptions: line.variantOptions,
		name: line.name,
		type: line.itemType,
		sku: line.sku,
		quantity,
		unitPriceCents: line.unitPriceCents,
		lineTotalCents: line.lineTotalCents,
		position: line.position,
		metadata: {
			...line.metadata,
			sourceModule: QUOTES_ESTIMATES_SOURCE,
			sourceRecordId: line.id,
		},
	};
}
