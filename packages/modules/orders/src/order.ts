import { CATALOG_ITEM_TYPES } from "@quickengine/mod-products-services/item";
import { z } from "zod";

const POSTGRES_INTEGER_MAX = 2_147_483_647;

export const orderLineInputSchema = z
	.object({
		catalogItemId: z.uuid().nullable().default(null),
		catalogItemVariantId: z.uuid().nullable().default(null),
		name: z.string().trim().min(1).max(160),
		type: z.enum(CATALOG_ITEM_TYPES),
		sku: z.string().trim().min(1).max(100).nullable().default(null),
		quantity: z.number().int().positive().max(1_000_000),
		unitPriceCents: z.number().int().nonnegative().max(POSTGRES_INTEGER_MAX),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.refine(
		(line) => line.quantity * line.unitPriceCents <= POSTGRES_INTEGER_MAX,
		{ message: "Line total exceeds the supported amount" },
	)
	.refine((line) => !line.catalogItemVariantId || Boolean(line.catalogItemId), {
		message: "A product variant requires its parent catalog item",
		path: ["catalogItemVariantId"],
	});

export type OrderLineInput = z.input<typeof orderLineInputSchema>;
export type OrderLine = z.output<typeof orderLineInputSchema>;

export const orderInputSchema = z
	.object({
		clientId: z.uuid(),
		currency: z
			.string()
			.trim()
			.toUpperCase()
			.regex(/^[A-Z]{3}$/)
			.default("USD"),
		notes: z.string().trim().max(10_000).nullable().default(null),
		lines: z.array(orderLineInputSchema).min(1).max(500),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.refine(
		(order) =>
			order.lines.reduce(
				(total, line) => total + line.quantity * line.unitPriceCents,
				0,
			) <= POSTGRES_INTEGER_MAX,
		{ message: "Order total exceeds the supported amount", path: ["lines"] },
	);

export type OrderInput = z.input<typeof orderInputSchema>;
export type Order = z.output<typeof orderInputSchema>;
