import { z } from "zod";

export const CATALOG_ITEM_TYPES = [
	"physical",
	"digital",
	"service",
	"package",
	"rental",
] as const;
export type CatalogItemType = (typeof CATALOG_ITEM_TYPES)[number];

export const PRICING_MODELS = [
	"fixed",
	"starting_at",
	"hourly",
	"custom_quote",
	"free",
] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const CATALOG_ITEM_STATUSES = ["draft", "active", "archived"] as const;
export type CatalogItemStatus = (typeof CATALOG_ITEM_STATUSES)[number];

const catalogItemFieldsSchema = z.object({
	name: z.string().trim().min(1).max(160),
	description: z.string().trim().max(10_000).nullable().default(null),
	type: z.enum(CATALOG_ITEM_TYPES),
	status: z.enum(CATALOG_ITEM_STATUSES).default("draft"),
	sku: z.string().trim().toUpperCase().min(1).max(100).nullable().default(null),
	pricingModel: z.enum(PRICING_MODELS).default("fixed"),
	priceCents: z.number().int().nonnegative().nullable().default(null),
	currency: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{3}$/)
		.default("USD"),
	unitLabel: z.string().trim().min(1).max(40).nullable().default(null),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

export const catalogItemInputSchema = catalogItemFieldsSchema.superRefine(
	(item, context) => {
		if (
			["fixed", "starting_at", "hourly"].includes(item.pricingModel) &&
			item.priceCents === null
		) {
			context.addIssue({
				code: "custom",
				path: ["priceCents"],
				message: `${item.pricingModel} pricing requires a price`,
			});
		}
		if (
			["custom_quote", "free"].includes(item.pricingModel) &&
			item.priceCents !== null
		) {
			context.addIssue({
				code: "custom",
				path: ["priceCents"],
				message: `${item.pricingModel} pricing cannot store a price`,
			});
		}
	},
);

export type CatalogItemInput = z.input<typeof catalogItemInputSchema>;
export type CatalogItem = z.output<typeof catalogItemInputSchema>;

export const catalogItemPatchSchema = z
	.object({
		name: z.string().trim().min(1).max(160).optional(),
		description: z.string().trim().max(10_000).nullable().optional(),
		type: z.enum(CATALOG_ITEM_TYPES).optional(),
		sku: z.string().trim().toUpperCase().min(1).max(100).nullable().optional(),
		pricingModel: z.enum(PRICING_MODELS).optional(),
		priceCents: z.number().int().nonnegative().nullable().optional(),
		currency: z
			.string()
			.trim()
			.toUpperCase()
			.regex(/^[A-Z]{3}$/)
			.optional(),
		unitLabel: z.string().trim().min(1).max(40).nullable().optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	})
	.strict()
	.refine((patch) => Object.keys(patch).length > 0, {
		message: "At least one catalog item field is required",
	});
export type CatalogItemPatch = z.input<typeof catalogItemPatchSchema>;

const ALLOWED_TRANSITIONS: Record<CatalogItemStatus, CatalogItemStatus[]> = {
	draft: ["active", "archived"],
	active: ["draft", "archived"],
	archived: ["draft"],
};

export function canTransitionCatalogItem(
	from: CatalogItemStatus,
	to: CatalogItemStatus,
): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}
