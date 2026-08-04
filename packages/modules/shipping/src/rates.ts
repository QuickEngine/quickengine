import {
	and,
	asc,
	catalogItems,
	catalogItemVariants,
	db,
	eq,
	inArray,
	shippingRates,
	shippingZones,
	sql,
} from "@quickengine/db";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// SHIPPING QUOTES — what it costs to deliver this basket to this address.
//
// 🔴 Every failure in this file is a failure that costs the merchant money on
// every order and is invisible for weeks. So the governing rule is: **when the
// answer is not knowable, refuse — never fall back to zero.** Free shipping is
// something a merchant chooses, never something a bug decides for them.
//
// Three refusals exist, and they are deliberately distinct because the merchant
// has to do something different about each:
//
//   · `NO_ZONE_FOR_DESTINATION` — we do not ship there at all. Add a zone.
//   · `NO_RATE_FOR_BASKET`      — we ship there, but nothing covers this basket.
//                                 Usually a weight cap. Add a band.
//   · `MISSING_ITEM_WEIGHT`     — a weight-priced rate met an item with no
//                                 weight. Fix the item.
//
// Collapsing any of those into "shipping is $0" is the bug this module exists to
// not have.
// ─────────────────────────────────────────────────────────────────────────────

export class ShippingQuoteError extends Error {
	constructor(
		readonly code:
			| "NO_ZONE_FOR_DESTINATION"
			| "NO_RATE_FOR_BASKET"
			| "MISSING_ITEM_WEIGHT"
			| "ITEM_NOT_FOUND",
		message: string,
		readonly detail?: Record<string, unknown>,
	) {
		super(message);
	}
}

/** ISO 3166-1 alpha-2, normalised. */
const countryCode = z
	.string()
	.trim()
	.length(2)
	.transform((value) => value.toUpperCase());

/** ISO 3166-2, e.g. `CA-AB`. Normalised to uppercase. */
const regionCode = z
	.string()
	.trim()
	.min(2)
	.max(6)
	.transform((value) => value.toUpperCase());

export const shippingDestinationSchema = z.object({
	countryCode,
	regionCode: regionCode.nullable().optional(),
	postalCode: z.string().trim().max(20).nullable().optional(),
});

export type ShippingDestination = z.infer<typeof shippingDestinationSchema>;

export const shippingQuoteInputSchema = z.object({
	destination: shippingDestinationSchema,
	/**
	 * ⚠️ Ids and quantities only — never a price and never a weight.
	 *
	 * The same rule the checkout already follows. A browser holding a public
	 * storefront key must not be able to tell the server that its 40kg order
	 * weighs 10 grams.
	 */
	lines: z
		.array(
			z.object({
				catalogItemId: z.uuid(),
				catalogItemVariantId: z.uuid().nullable().optional(),
				quantity: z.number().int().min(1).max(10_000),
			}),
		)
		.min(1)
		.max(200),
});

export type ShippingQuoteInput = z.infer<typeof shippingQuoteInputSchema>;

export type ShippingOption = {
	rateId: string;
	name: string;
	description: string | null;
	amountCents: number;
	/** True when `freeOverCents` was met — the UI says "Free shipping", not "$0.00". */
	free: boolean;
	estimatedDaysMin: number | null;
	estimatedDaysMax: number | null;
};

export type ShippingQuote = {
	zone: { id: string; name: string };
	billableWeightGrams: number;
	options: ShippingOption[];
};

const countryCodesSchema = z
	.array(countryCode)
	.max(250)
	.default([])
	.transform((values) => [...new Set(values)].sort());
const regionCodesSchema = z
	.array(regionCode)
	.max(500)
	.default([])
	.transform((values) => [...new Set(values)].sort());

export const shippingZoneInputSchema = z
	.object({
		name: z.string().trim().min(1).max(160),
		countryCodes: countryCodesSchema,
		regionCodes: regionCodesSchema,
		priority: z.number().int().min(-10_000).max(10_000).default(0),
		active: z.boolean().default(true),
	})
	.superRefine((value, context) => {
		for (const region of value.regionCodes) {
			const regionCountry = region.split("-")[0];
			if (
				value.countryCodes.length > 0 &&
				regionCountry &&
				!value.countryCodes.includes(regionCountry)
			) {
				context.addIssue({
					code: "custom",
					message: `${region} is outside this zone's countries.`,
					path: ["regionCodes"],
				});
			}
		}
	});

export const shippingRateInputSchema = z
	.object({
		zoneId: z.uuid(),
		name: z.string().trim().min(1).max(160),
		description: z.string().trim().max(2_000).nullable().optional(),
		minWeightGrams: z.number().int().min(0).nullable().optional(),
		maxWeightGrams: z.number().int().positive().nullable().optional(),
		minOrderCents: z.number().int().min(0).nullable().optional(),
		maxOrderCents: z.number().int().positive().nullable().optional(),
		baseCents: z.number().int().min(0).default(0),
		perKgCents: z.number().int().min(0).nullable().optional(),
		freeOverCents: z.number().int().min(0).nullable().optional(),
		estimatedDaysMin: z.number().int().min(0).nullable().optional(),
		estimatedDaysMax: z.number().int().min(0).nullable().optional(),
		active: z.boolean().default(true),
	})
	.superRefine((value, context) => {
		for (const [min, max, path] of [
			[value.minWeightGrams, value.maxWeightGrams, "maxWeightGrams"],
			[value.minOrderCents, value.maxOrderCents, "maxOrderCents"],
			[value.estimatedDaysMin, value.estimatedDaysMax, "estimatedDaysMax"],
		] as const) {
			if (min != null && max != null && max <= min) {
				context.addIssue({
					code: "custom",
					message: "The maximum must be greater than the minimum.",
					path: [path],
				});
			}
		}
	});

export type ShippingZoneInput = z.infer<typeof shippingZoneInputSchema>;
export type ShippingRateInput = z.infer<typeof shippingRateInputSchema>;

export class ShippingRateConfigError extends Error {
	constructor(
		readonly code:
			| "SHIPPING_ZONE_NOT_FOUND"
			| "SHIPPING_RATE_NOT_FOUND"
			| "SHIPPING_ZONE_NAME_TAKEN"
			| "SHIPPING_RATE_NAME_TAKEN"
			| "SHIPPING_ZONE_HAS_RATES",
		message: string,
	) {
		super(message);
	}
}

function isSqlState(error: unknown, code: string): boolean {
	for (let current = error, depth = 0; current && depth < 5; depth += 1) {
		if ((current as { code?: string }).code === code) return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

export async function listShippingZones(workspaceId: string) {
	const zones = await db
		.select()
		.from(shippingZones)
		.where(eq(shippingZones.workspaceId, workspaceId))
		.orderBy(sql`${shippingZones.priority} desc`, asc(shippingZones.name));
	const rates = await db
		.select()
		.from(shippingRates)
		.where(eq(shippingRates.workspaceId, workspaceId))
		.orderBy(asc(shippingRates.baseCents), asc(shippingRates.name));
	return zones.map((zone) => ({
		...zone,
		rates: rates.filter((rate) => rate.zoneId === zone.id),
	}));
}

export async function createShippingZone(
	workspaceId: string,
	input: ShippingZoneInput,
) {
	const parsed = shippingZoneInputSchema.parse(input);
	try {
		const [row] = await db
			.insert(shippingZones)
			.values({ workspaceId, ...parsed })
			.returning();
		return row;
	} catch (error) {
		if (isSqlState(error, "23505")) {
			throw new ShippingRateConfigError(
				"SHIPPING_ZONE_NAME_TAKEN",
				"Another shipping zone already uses that name.",
			);
		}
		throw error;
	}
}

export async function updateShippingZone(
	workspaceId: string,
	id: string,
	input: Partial<ShippingZoneInput>,
) {
	const parsed = shippingZoneInputSchema.partial().parse(input);
	try {
		const [row] = await db
			.update(shippingZones)
			.set({ ...parsed, updatedAt: new Date() })
			.where(
				and(
					eq(shippingZones.workspaceId, workspaceId),
					eq(shippingZones.id, id),
				),
			)
			.returning();
		if (!row) {
			throw new ShippingRateConfigError(
				"SHIPPING_ZONE_NOT_FOUND",
				"The shipping zone was not found.",
			);
		}
		return row;
	} catch (error) {
		if (isSqlState(error, "23505")) {
			throw new ShippingRateConfigError(
				"SHIPPING_ZONE_NAME_TAKEN",
				"Another shipping zone already uses that name.",
			);
		}
		throw error;
	}
}

export async function deleteShippingZone(workspaceId: string, id: string) {
	try {
		const [row] = await db
			.delete(shippingZones)
			.where(
				and(
					eq(shippingZones.workspaceId, workspaceId),
					eq(shippingZones.id, id),
				),
			)
			.returning({ id: shippingZones.id });
		if (!row) {
			throw new ShippingRateConfigError(
				"SHIPPING_ZONE_NOT_FOUND",
				"The shipping zone was not found.",
			);
		}
		return row;
	} catch (error) {
		if (isSqlState(error, "23503")) {
			throw new ShippingRateConfigError(
				"SHIPPING_ZONE_HAS_RATES",
				"Delete this zone's rates before deleting the zone.",
			);
		}
		throw error;
	}
}

async function assertZone(workspaceId: string, zoneId: string) {
	const [zone] = await db
		.select({ id: shippingZones.id })
		.from(shippingZones)
		.where(
			and(
				eq(shippingZones.workspaceId, workspaceId),
				eq(shippingZones.id, zoneId),
			),
		)
		.limit(1);
	if (!zone) {
		throw new ShippingRateConfigError(
			"SHIPPING_ZONE_NOT_FOUND",
			"The shipping zone was not found.",
		);
	}
}

export async function createShippingRate(
	workspaceId: string,
	input: ShippingRateInput,
) {
	const parsed = shippingRateInputSchema.parse(input);
	await assertZone(workspaceId, parsed.zoneId);
	try {
		const [row] = await db
			.insert(shippingRates)
			.values({ workspaceId, ...parsed })
			.returning();
		return row;
	} catch (error) {
		if (isSqlState(error, "23505")) {
			throw new ShippingRateConfigError(
				"SHIPPING_RATE_NAME_TAKEN",
				"That zone already has a rate with this name.",
			);
		}
		throw error;
	}
}

export async function updateShippingRate(
	workspaceId: string,
	id: string,
	input: Partial<ShippingRateInput>,
) {
	const parsed = shippingRateInputSchema.partial().parse(input);
	if (parsed.zoneId) await assertZone(workspaceId, parsed.zoneId);
	try {
		const [row] = await db
			.update(shippingRates)
			.set({ ...parsed, updatedAt: new Date() })
			.where(
				and(
					eq(shippingRates.workspaceId, workspaceId),
					eq(shippingRates.id, id),
				),
			)
			.returning();
		if (!row) {
			throw new ShippingRateConfigError(
				"SHIPPING_RATE_NOT_FOUND",
				"The shipping rate was not found.",
			);
		}
		return row;
	} catch (error) {
		if (isSqlState(error, "23505")) {
			throw new ShippingRateConfigError(
				"SHIPPING_RATE_NAME_TAKEN",
				"That zone already has a rate with this name.",
			);
		}
		throw error;
	}
}

export async function deleteShippingRate(workspaceId: string, id: string) {
	const [row] = await db
		.delete(shippingRates)
		.where(
			and(eq(shippingRates.workspaceId, workspaceId), eq(shippingRates.id, id)),
		)
		.returning({ id: shippingRates.id });
	if (!row) {
		throw new ShippingRateConfigError(
			"SHIPPING_RATE_NOT_FOUND",
			"The shipping rate was not found.",
		);
	}
	return row;
}

/**
 * Pick the ONE zone that governs a destination.
 *
 * 🔴 The prototype had no answer here: two zones could both list `CA` and which
 * one applied depended on the order Postgres returned rows in, which is to say on
 * nothing. A merchant would see a different shipping price for the same address on
 * different days and have no way to explain it.
 *
 * The rule, in order:
 *
 *   1. **Specificity.** A zone naming this region beats one naming only the
 *      country, which beats a catch-all. "Alberta local $5" must win over
 *      "Canada $15" — otherwise there is no point being able to express it.
 *   2. **`priority` descending** — the operator's own tiebreak between two
 *      equally specific zones.
 *   3. **`createdAt` ascending**, then `id`. Not meaningful, but *total*: the
 *      point is that the answer is never arbitrary.
 *
 * Returns null rather than throwing, because "we don't ship there" is a normal
 * answer a storefront needs to render, not an exception.
 */
export async function matchShippingZone(
	workspaceId: string,
	destination: ShippingDestination,
): Promise<{ id: string; name: string; precedence: number } | null> {
	const parsed = shippingDestinationSchema.parse(destination);
	const region = parsed.regionCode ?? null;

	const precedence = sql<number>`
		case
			when ${shippingZones.regionCodes} <> '{}' then 2
			when ${shippingZones.countryCodes} <> '{}' then 1
			else 0
		end
	`;

	const [zone] = await db
		.select({
			id: shippingZones.id,
			name: shippingZones.name,
			precedence,
		})
		.from(shippingZones)
		.where(
			and(
				eq(shippingZones.workspaceId, workspaceId),
				eq(shippingZones.active, true),
				sql`(
					(${shippingZones.regionCodes} <> '{}' and ${region}::text = any(${shippingZones.regionCodes}))
					or (${shippingZones.regionCodes} = '{}' and ${shippingZones.countryCodes} <> '{}' and ${parsed.countryCode}::text = any(${shippingZones.countryCodes}))
					or (${shippingZones.regionCodes} = '{}' and ${shippingZones.countryCodes} = '{}')
				)`,
			),
		)
		.orderBy(
			sql`${precedence} desc`,
			sql`${shippingZones.priority} desc`,
			asc(shippingZones.createdAt),
			asc(shippingZones.id),
		)
		.limit(1);

	return zone ?? null;
}

/**
 * The weight this basket is billed at.
 *
 * A variant's override wins over its item, and **null means unknown, not zero** —
 * so this returns null the moment any line cannot be weighed, and the caller
 * decides whether that matters. It only matters if a rate is priced per kilogram,
 * which is why a shop selling flat-rate never has to enter a weight at all.
 */
async function billableWeightGrams(
	workspaceId: string,
	lines: ShippingQuoteInput["lines"],
): Promise<{ grams: number | null; unweighed: string[] }> {
	const itemIds = [...new Set(lines.map((line) => line.catalogItemId))];
	const variantIds = [
		...new Set(
			lines
				.map((line) => line.catalogItemVariantId)
				.filter((id): id is string => Boolean(id)),
		),
	];

	const items = await db
		.select({ id: catalogItems.id, weightGrams: catalogItems.weightGrams })
		.from(catalogItems)
		.where(
			and(
				// Tenancy in the WHERE clause, not checked after. A quote that can be
				// asked about another workspace's catalog is a data leak wearing the
				// costume of a shipping bug.
				eq(catalogItems.workspaceId, workspaceId),
				inArray(catalogItems.id, itemIds),
			),
		);
	const itemWeight = new Map(items.map((row) => [row.id, row.weightGrams]));

	const missingItem = itemIds.find((id) => !itemWeight.has(id));
	if (missingItem) {
		throw new ShippingQuoteError(
			"ITEM_NOT_FOUND",
			"That item is not available.",
			{ catalogItemId: missingItem },
		);
	}

	const variantWeight = new Map<string, number | null>();
	if (variantIds.length > 0) {
		const variants = await db
			.select({
				id: catalogItemVariants.id,
				weightGramsOverride: catalogItemVariants.weightGramsOverride,
			})
			.from(catalogItemVariants)
			.where(
				and(
					eq(catalogItemVariants.workspaceId, workspaceId),
					inArray(catalogItemVariants.id, variantIds),
				),
			);
		for (const variant of variants) {
			variantWeight.set(variant.id, variant.weightGramsOverride);
		}
	}

	let grams = 0;
	const unweighed: string[] = [];
	for (const line of lines) {
		const override = line.catalogItemVariantId
			? (variantWeight.get(line.catalogItemVariantId) ?? null)
			: null;
		const weight = override ?? itemWeight.get(line.catalogItemId) ?? null;
		if (weight === null) {
			unweighed.push(line.catalogItemId);
			continue;
		}
		grams += weight * line.quantity;
	}

	return { grams: unweighed.length > 0 ? null : grams, unweighed };
}

/** Inclusive minimum, exclusive maximum — see the schema note on band bounds. */
function withinBand(
	value: number,
	min: number | null,
	max: number | null,
): boolean {
	if (min !== null && value < min) return false;
	if (max !== null && value >= max) return false;
	return true;
}

/**
 * What this basket costs to ship, as the options a customer chooses between.
 *
 * ⚠️ `discountedSubtotalCents` is the subtotal AFTER any discount. Both the
 * order-value bands and `freeOverCents` measure against it, because "free
 * shipping over $100" applied to a pre-discount total gives free shipping to
 * somebody who paid $70 — which is neither what the merchant advertised nor what
 * they budgeted for.
 */
export async function quoteShipping(input: {
	workspaceId: string;
	quote: ShippingQuoteInput;
	discountedSubtotalCents: number;
}): Promise<ShippingQuote> {
	const parsed = shippingQuoteInputSchema.parse(input.quote);
	const subtotal = Math.max(0, Math.trunc(input.discountedSubtotalCents));

	const zone = await matchShippingZone(input.workspaceId, parsed.destination);
	if (!zone) {
		throw new ShippingQuoteError(
			"NO_ZONE_FOR_DESTINATION",
			"This business doesn't ship to that address.",
			{ countryCode: parsed.destination.countryCode },
		);
	}

	const rates = await db
		.select()
		.from(shippingRates)
		.where(
			and(
				eq(shippingRates.workspaceId, input.workspaceId),
				eq(shippingRates.zoneId, zone.id),
				eq(shippingRates.active, true),
			),
		)
		.orderBy(asc(shippingRates.baseCents), asc(shippingRates.name));

	if (rates.length === 0) {
		throw new ShippingQuoteError(
			"NO_RATE_FOR_BASKET",
			"No delivery option is set up for that address.",
			{ zoneId: zone.id },
		);
	}

	// Only weigh the basket if some rate actually prices by weight. A flat-rate
	// shop must never be forced to enter weights it has no use for.
	const needsWeight = rates.some(
		(rate) =>
			rate.perKgCents !== null ||
			rate.minWeightGrams !== null ||
			rate.maxWeightGrams !== null,
	);

	let grams = 0;
	if (needsWeight) {
		const weighed = await billableWeightGrams(input.workspaceId, parsed.lines);
		if (weighed.grams === null) {
			throw new ShippingQuoteError(
				"MISSING_ITEM_WEIGHT",
				"Some items don't have a shipping weight set, so delivery can't be priced.",
				{ catalogItemIds: weighed.unweighed },
			);
		}
		grams = weighed.grams;
	}

	const options: ShippingOption[] = [];
	for (const rate of rates) {
		if (!withinBand(grams, rate.minWeightGrams, rate.maxWeightGrams)) continue;
		if (!withinBand(subtotal, rate.minOrderCents, rate.maxOrderCents)) continue;

		const free = rate.freeOverCents !== null && subtotal >= rate.freeOverCents;

		// Part kilograms round UP. Carriers do it, and rounding down means the
		// merchant pays the difference on every parcel that is not exact.
		const weightCents =
			rate.perKgCents === null ? 0 : Math.ceil(grams / 1000) * rate.perKgCents;

		options.push({
			rateId: rate.id,
			name: rate.name,
			description: rate.description,
			amountCents: free ? 0 : rate.baseCents + weightCents,
			free,
			estimatedDaysMin: rate.estimatedDaysMin,
			estimatedDaysMax: rate.estimatedDaysMax,
		});
	}

	if (options.length === 0) {
		// 🔴 Distinct from having no zone. The merchant DOES ship here; this basket
		// fell outside every band they wrote — nearly always a weight cap. Telling
		// them "no zone" would send them to fix the wrong screen.
		throw new ShippingQuoteError(
			"NO_RATE_FOR_BASKET",
			"This order is outside the delivery options available for that address.",
			{ zoneId: zone.id, billableWeightGrams: grams },
		);
	}

	options.sort((a, b) => a.amountCents - b.amountCents);
	return {
		zone: { id: zone.id, name: zone.name },
		billableWeightGrams: grams,
		options,
	};
}

/**
 * Re-price ONE chosen rate at order time.
 *
 * 🔴 The checkout must call this rather than trusting an `amountCents` sent back
 * by the browser. The client picks WHICH option; it never says what that option
 * costs. Same rule as the catalog prices — a public storefront key is only safe
 * because nothing it sends is ever treated as money.
 */
export async function priceChosenRate(input: {
	workspaceId: string;
	rateId: string;
	quote: ShippingQuoteInput;
	discountedSubtotalCents: number;
}): Promise<ShippingOption> {
	const quote = await quoteShipping(input);
	const chosen = quote.options.find((option) => option.rateId === input.rateId);
	if (!chosen) {
		throw new ShippingQuoteError(
			"NO_RATE_FOR_BASKET",
			"That delivery option isn't available for this order.",
			{ rateId: input.rateId },
		);
	}
	return chosen;
}
