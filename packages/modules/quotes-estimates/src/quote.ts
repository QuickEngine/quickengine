import { CATALOG_ITEM_TYPES } from "@quickengine/mod-products-services/item";
import { z } from "zod";
import { computeQuoteTotals, quoteLineTotalCents } from "./totals";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

export const QUOTE_ESTIMATE_KINDS = ["quote", "estimate", "proposal"] as const;
export type QuoteEstimateKind = (typeof QUOTE_ESTIMATE_KINDS)[number];

function isRealCalendarDate(value: string): boolean {
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

export const quoteCalendarDateSchema = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine(isRealCalendarDate, "Invalid calendar date");

export function normalizeQuoteQuantity(value: string | number): string {
	if (typeof value === "number" && !Number.isFinite(value)) {
		throw new Error("QUOTE_QUANTITY_INVALID");
	}
	const text = String(value).trim();
	if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(text)) {
		throw new Error("QUOTE_QUANTITY_INVALID");
	}
	const [whole, fraction = ""] = text.split(".");
	const normalizedFraction = fraction.replace(/0+$/, "");
	const normalized = normalizedFraction
		? `${BigInt(whole)}.${normalizedFraction}`
		: BigInt(whole).toString();
	if (normalized === "0") throw new Error("QUOTE_QUANTITY_INVALID");
	return normalized;
}

export const quoteQuantitySchema = z
	.union([z.string(), z.number()])
	.transform((value, context) => {
		try {
			return normalizeQuoteQuantity(value);
		} catch {
			context.addIssue({
				code: "custom",
				message: "Quantity must be positive with at most three decimal places",
			});
			return z.NEVER;
		}
	});

export const quoteEstimateLineInputSchema = z
	.object({
		catalogItemId: z.uuid().nullable().default(null),
		catalogItemVariantId: z.uuid().nullable().default(null),
		name: z.string().trim().min(1).max(160),
		description: z.string().trim().max(4_000).nullable().default(null),
		itemType: z.enum(CATALOG_ITEM_TYPES).default("service"),
		sku: z.string().trim().min(1).max(100).nullable().default(null),
		quantity: quoteQuantitySchema,
		unitLabel: z.string().trim().min(1).max(40).nullable().default(null),
		unitPriceCents: z.number().int().nonnegative().max(POSTGRES_INTEGER_MAX),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.refine((line) => !line.catalogItemVariantId || Boolean(line.catalogItemId), {
		message: "A product variant requires its parent catalog item",
		path: ["catalogItemVariantId"],
	})
	.superRefine((line, context) => {
		try {
			quoteLineTotalCents(line);
		} catch {
			context.addIssue({
				code: "custom",
				message: "Line total exceeds the supported amount",
				path: ["unitPriceCents"],
			});
		}
	});

export type QuoteEstimateLineInput = z.input<
	typeof quoteEstimateLineInputSchema
>;
export type QuoteEstimateLine = z.output<typeof quoteEstimateLineInputSchema>;

export const quoteEstimateInputSchema = z
	.object({
		clientId: z.uuid(),
		kind: z.enum(QUOTE_ESTIMATE_KINDS).default("quote"),
		title: z.string().trim().min(1).max(200),
		currency: z
			.string()
			.trim()
			.toUpperCase()
			.regex(/^[A-Z]{3}$/)
			.default("USD"),
		validUntil: quoteCalendarDateSchema.nullable().default(null),
		notes: z.string().trim().max(10_000).nullable().default(null),
		terms: z.string().trim().max(20_000).nullable().default(null),
		taxCents: z
			.number()
			.int()
			.nonnegative()
			.max(POSTGRES_INTEGER_MAX)
			.default(0),
		lines: z.array(quoteEstimateLineInputSchema).min(1).max(500),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.superRefine((quote, context) => {
		try {
			computeQuoteTotals(quote.lines, quote.taxCents);
		} catch {
			context.addIssue({
				code: "custom",
				message: "Quote total exceeds the supported amount",
				path: ["lines"],
			});
		}
	});

export type QuoteEstimateInput = z.input<typeof quoteEstimateInputSchema>;
export type QuoteEstimate = z.output<typeof quoteEstimateInputSchema>;

export const quoteAcceptanceInputSchema = z.object({
	acceptedByName: z.string().trim().min(1).max(200),
	acceptedByEmail: z.email().nullable().default(null),
	note: z.string().trim().max(2_000).nullable().default(null),
});

export type QuoteAcceptanceInput = z.input<typeof quoteAcceptanceInputSchema>;
