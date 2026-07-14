import { z } from "zod";

export const VARIANT_STATUSES = ["draft", "active", "archived"] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

export const variantOptionSchema = z.object({
	name: z.string().trim().min(1).max(40),
	value: z.string().trim().min(1).max(100),
});
export type VariantOption = z.output<typeof variantOptionSchema>;

export const productVariantInputSchema = z
	.object({
		options: z.array(variantOptionSchema).min(1).max(10),
		status: z.enum(VARIANT_STATUSES).default("draft"),
		sku: z
			.string()
			.trim()
			.toUpperCase()
			.min(1)
			.max(100)
			.nullable()
			.default(null),
		// Null inherits the parent catalog item's price. A concrete override remains
		// integer cents and uses the parent's currency/pricing model.
		priceCentsOverride: z.number().int().nonnegative().nullable().default(null),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.superRefine((variant, context) => {
		const names = new Set<string>();
		for (const [index, option] of variant.options.entries()) {
			const normalizedName = option.name.toLocaleLowerCase("en-US");
			if (names.has(normalizedName)) {
				context.addIssue({
					code: "custom",
					path: ["options", index, "name"],
					message: "A variant cannot repeat an option name",
				});
			}
			names.add(normalizedName);
		}
	});

export type ProductVariantInput = z.input<typeof productVariantInputSchema>;
export type ProductVariant = z.output<typeof productVariantInputSchema>;

export const productVariantPatchSchema = z
	.object({
		options: z.array(variantOptionSchema).min(1).max(10).optional(),
		sku: z.string().trim().toUpperCase().min(1).max(100).nullable().optional(),
		priceCentsOverride: z.number().int().nonnegative().nullable().optional(),
		metadata: z.record(z.string(), z.unknown()).optional(),
	})
	.strict()
	.refine((patch) => Object.keys(patch).length > 0, {
		message: "At least one variant field is required",
	});
export type ProductVariantPatch = z.input<typeof productVariantPatchSchema>;

/** Stable identity for one concrete combination, independent of option order/case. */
export function variantCombinationKey(
	options: readonly VariantOption[],
): string {
	return options
		.map((option) => [
			option.name.trim().toLocaleLowerCase("en-US"),
			option.value.trim().toLocaleLowerCase("en-US"),
		])
		.sort(([left], [right]) => left.localeCompare(right, "en-US"))
		.map(([name, value]) => `${name}=${value}`)
		.join("|");
}

export function formatVariantLabel(options: readonly VariantOption[]): string {
	return options.map((option) => `${option.name}: ${option.value}`).join(" / ");
}

const ALLOWED_TRANSITIONS: Record<VariantStatus, readonly VariantStatus[]> = {
	draft: ["active", "archived"],
	active: ["draft", "archived"],
	archived: ["draft"],
};

export function canTransitionVariant(
	from: VariantStatus,
	to: VariantStatus,
): boolean {
	return ALLOWED_TRANSITIONS[from].includes(to);
}
