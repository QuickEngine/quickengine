import {
	and,
	catalogItems,
	catalogItemVariants,
	clientRecords,
	db,
	eq,
	inArray,
	sql,
	workspaceModules,
} from "@quickengine/db";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT — the only write a public website may perform.
//
// 🔴 THE RULE THIS FILE EXISTS TO ENFORCE: the caller never sends a price.
//
// A storefront key ships in page source. Anyone can read it, and anyone can send
// whatever body they like with it. The single thing that makes that survivable
// is that the request names WHAT is being bought, and the server decides what it
// costs — from its own catalog, inside its own transaction.
//
// Every field a caller could use to influence money is absent from the input
// schema by design. If you are adding one, you are removing the property that
// lets this route be public at all.
// ─────────────────────────────────────────────────────────────────────────────

export const checkoutItemSchema = z.object({
	catalogItemId: z.uuid(),
	/** Optional: an item may have no variants. */
	variantId: z.uuid().optional(),
	// Capped. An unbounded quantity is an integer-overflow probe and a way to
	// reserve a merchant's entire stock with one request.
	quantity: z.number().int().min(1).max(1_000),
});

export const checkoutShippingAddressSchema = z.object({
	name: z.string().trim().min(1).max(200),
	line1: z.string().trim().min(1).max(300),
	line2: z.string().trim().max(300).nullable().optional(),
	city: z.string().trim().min(1).max(160),
	region: z.string().trim().min(1).max(160),
	postalCode: z.string().trim().min(1).max(20),
	countryCode: z.string().trim().toUpperCase().length(2),
});

export const checkoutInputSchema = z
	.object({
		/**
		 * ⚠️ Optional ONLY because a subscription supplies its own contents. Exactly
		 * one of `items` or `subscriptionPlanId` must be present — enforced by the
		 * refinement below, not by hope.
		 */
		items: z.array(checkoutItemSchema).min(1).max(100).optional(),
		/**
		 * Who is buying. The only identity a guest has.
		 *
		 * Used to find or create a client record, which is what later lets them claim
		 * the purchase by verifying the same address — see `bindMembership`.
		 */
		email: z.email().max(320),
		name: z.string().trim().max(200).optional(),
		notes: z.string().trim().max(2_000).optional(),
		/**
		 * A discount code the shopper typed.
		 *
		 * ⚠️ The CODE is accepted; the AMOUNT never is. The server looks the code up,
		 * checks its window, minimum, and caps, and computes what it takes off from
		 * the subtotal it priced itself.
		 */
		discountCode: z.string().trim().min(3).max(40).optional(),
		/**
		 * A referral code the shopper was given by an existing customer.
		 *
		 * ⚠️ Does NOT change what this order costs. It records who brought this
		 * customer and what the referrer earns — a separate concern from a discount,
		 * which is why they are two fields rather than one "code".
		 */
		referralCode: z.string().trim().min(4).max(40).optional(),
		/**
		 * Buy a recurring plan instead of a one-off basket.
		 *
		 * 🔴 Mutually exclusive with `items`. A plan already says what is in the box,
		 * and accepting both would let a caller subscribe to one thing while being
		 * charged for another — the plan's price with the basket's contents.
		 *
		 * ⚠️ Only the plan ID is accepted. Its price, interval and contents are read
		 * from the plan itself, for the same reason no price is ever accepted here.
		 */
		subscriptionPlanId: z.uuid().optional(),
		/** The browser chooses an offered rate; the server recomputes its amount. */
		shippingRateId: z.uuid().optional(),
		shippingAddress: checkoutShippingAddressSchema.optional(),
		// ⚠️ NOT accepted, deliberately, and each one is a way to steal:
		// · any price, subtotal, total, tax or discount field
		// · clientId — a caller naming somebody else's client record attaches a
		//   stranger's purchase to them, which is the prototype's bug
		// · currency — it comes from the catalog item, not the buyer
	})
	.refine(
		(input) => Boolean(input.items) !== Boolean(input.subscriptionPlanId),
		{
			message:
				"Send either items or a subscription plan, not both and not neither.",
			path: ["items"],
		},
	);

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export type PricedLine = {
	catalogItemId: string;
	catalogItemVariantId: string | null;
	/** Snapshotted at purchase, so a later rename does not rewrite history. */
	name: string;
	type: "physical" | "digital" | "service" | "package" | "rental";
	sku: string | null;
	quantity: number;
	unitPriceCents: number;
};

export type PricedCheckout = {
	lines: PricedLine[];
	subtotalCents: number;
	currency: string;
};

export class CheckoutError extends Error {
	constructor(
		readonly code:
			| "ITEM_NOT_AVAILABLE"
			| "MIXED_CURRENCY"
			| "NOT_PURCHASABLE"
			| "EMPTY_CHECKOUT",
		message: string,
	) {
		super(message);
	}
}

/**
 * Turn a request into money, using only what the database says.
 *
 * ⚠️ Everything is scoped to `workspaceId` in the WHERE clause, not filtered
 * afterwards. A storefront naming another workspace's catalog item gets
 * "not available", never a price.
 */
export async function priceCheckout(
	workspaceId: string,
	items: readonly z.infer<typeof checkoutItemSchema>[],
): Promise<PricedCheckout> {
	if (items.length === 0) {
		throw new CheckoutError(
			"EMPTY_CHECKOUT",
			"A checkout needs at least one item.",
		);
	}

	const itemIds = [...new Set(items.map((item) => item.catalogItemId))];
	const variantIds = [
		...new Set(items.map((item) => item.variantId).filter(Boolean)),
	] as string[];

	const catalogRows = await db
		.select({
			id: catalogItems.id,
			name: catalogItems.name,
			status: catalogItems.status,
			type: catalogItems.type,
			sku: catalogItems.sku,
			pricingModel: catalogItems.pricingModel,
			priceCents: catalogItems.priceCents,
			currency: catalogItems.currency,
		})
		.from(catalogItems)
		.where(
			and(
				eq(catalogItems.workspaceId, workspaceId),
				inArray(catalogItems.id, itemIds),
			),
		);

	const variantRows = variantIds.length
		? await db
				.select({
					id: catalogItemVariants.id,
					catalogItemId: catalogItemVariants.catalogItemId,
					combinationKey: catalogItemVariants.combinationKey,
					sku: catalogItemVariants.sku,
					status: catalogItemVariants.status,
					priceCentsOverride: catalogItemVariants.priceCentsOverride,
				})
				.from(catalogItemVariants)
				.where(
					and(
						eq(catalogItemVariants.workspaceId, workspaceId),
						inArray(catalogItemVariants.id, variantIds),
					),
				)
		: [];

	const byItem = new Map(catalogRows.map((row) => [row.id, row]));
	const byVariant = new Map(variantRows.map((row) => [row.id, row]));

	const lines: PricedLine[] = [];
	let currency: string | null = null;

	for (const item of items) {
		const catalogItem = byItem.get(item.catalogItemId);
		// One message for missing, archived, draft and wrong-workspace. Telling a
		// caller which of those it was lets them map a competitor's catalog.
		if (catalogItem?.status !== "active") {
			throw new CheckoutError(
				"ITEM_NOT_AVAILABLE",
				"One of the items is not available.",
			);
		}

		let unitPriceCents = catalogItem.priceCents;
		let variantId: string | null = null;
		let name = catalogItem.name;
		let sku = catalogItem.sku;

		if (item.variantId) {
			const variant = byVariant.get(item.variantId);
			// The variant must belong to the item the caller named. Without this a
			// caller could pair a cheap variant with an expensive item.
			if (
				variant?.status !== "active" ||
				variant.catalogItemId !== catalogItem.id
			) {
				throw new CheckoutError(
					"ITEM_NOT_AVAILABLE",
					"One of the selected options is not available.",
				);
			}
			variantId = variant.id;
			name = `${catalogItem.name} — ${variant.combinationKey}`;
			// A variant with no SKU of its own inherits the item's.
			sku = variant.sku ?? catalogItem.sku;
			// An override of null means "same as the parent", not "free".
			if (variant.priceCentsOverride !== null) {
				unitPriceCents = variant.priceCentsOverride;
			}
		}

		// `custom_quote` has no price to charge, and `starting_at` is a marketing
		// figure rather than a sale price. Selling either at face value would take
		// money for something whose real cost was never agreed.
		if (
			catalogItem.pricingModel === "custom_quote" ||
			catalogItem.pricingModel === "starting_at" ||
			unitPriceCents === null
		) {
			throw new CheckoutError(
				"NOT_PURCHASABLE",
				"One of the items cannot be bought directly.",
			);
		}

		// 🔴 Mixed currencies cannot be summed, and silently picking one would
		// charge somebody the wrong amount in the wrong denomination.
		if (currency === null) currency = catalogItem.currency;
		else if (currency !== catalogItem.currency) {
			throw new CheckoutError(
				"MIXED_CURRENCY",
				"Everything in one order must share a currency.",
			);
		}

		lines.push({
			catalogItemId: catalogItem.id,
			catalogItemVariantId: variantId,
			// Truncated to the order-line limit rather than rejected: a long product
			// name is the merchant's business, and refusing the sale over it would be
			// absurd.
			name: name.slice(0, 160),
			type: catalogItem.type,
			sku,
			quantity: item.quantity,
			unitPriceCents,
		});
	}

	const subtotalCents = lines.reduce(
		(sum, line) => sum + line.quantity * line.unitPriceCents,
		0,
	);

	return { lines, subtotalCents, currency: currency ?? "USD" };
}

/**
 * The client record this purchase belongs to, created if this is a first visit.
 *
 * Matched case-insensitively on email, mirroring `bindMembership`, so a guest
 * who checks out twice with different capitalisation is one customer — and so
 * verifying that address later attaches the whole history to them.
 *
 * 🔴 The email comes from the request body, which is fine precisely because it
 * grants nothing. It attaches a purchase to an address; it does not read
 * anything belonging to that address. Reading requires a verified session.
 */
export async function resolveCheckoutClient(input: {
	workspaceId: string;
	email: string;
	name?: string;
}): Promise<{ id: string }> {
	const email = input.email.trim().toLowerCase();

	const [existing] = await db
		.select({ id: clientRecords.id })
		.from(clientRecords)
		.where(
			and(
				eq(clientRecords.workspaceId, input.workspaceId),
				sql`lower(${clientRecords.email}) = ${email}`,
			),
		)
		.limit(1);

	if (existing) return existing;

	const [created] = await db
		.insert(clientRecords)
		.values({
			workspaceId: input.workspaceId,
			name: input.name?.trim() || email,
			email,
		})
		.returning({ id: clientRecords.id });

	return created;
}

/**
 * The workspace's orders settings, as stored on its module row.
 *
 * Read here rather than taken from the request, because everything in it
 * influences money — the tax rate above all. A caller-supplied settings object
 * would be a caller-supplied tax rate.
 *
 * Returns defaults for a workspace that has never configured the module, so a
 * checkout never fails for want of a settings row.
 */
export async function readOrdersSettings(workspaceId: string): Promise<{
	taxRateBasisPoints: number;
	referrals: {
		enabled: boolean;
		rewardType: "fixed" | "percentage";
		rewardValue: number;
	};
}> {
	const [row] = await db
		.select({ settings: workspaceModules.settings })
		.from(workspaceModules)
		.where(
			and(
				eq(workspaceModules.workspaceId, workspaceId),
				eq(workspaceModules.moduleId, "orders"),
			),
		)
		.limit(1);

	const settings = (row?.settings ?? {}) as {
		taxRateBasisPoints?: unknown;
		referrals?: unknown;
	};
	const rate = Number(settings.taxRateBasisPoints ?? 0);
	// Same defensive parse as the tax rate: a corrupt settings blob falls back to
	// "off" rather than paying out an arbitrary reward.
	const ref = (settings.referrals ?? {}) as Record<string, unknown>;
	const rewardValue = Number(ref.rewardValue ?? 0);
	// A corrupt or out-of-range value falls back to no tax rather than charging
	// something arbitrary. Wrong-but-zero is recoverable; wrong-but-large is a
	// customer dispute.
	return {
		taxRateBasisPoints:
			Number.isInteger(rate) && rate >= 0 && rate <= 10_000 ? rate : 0,
		referrals: {
			enabled: ref.enabled === true,
			rewardType: ref.rewardType === "percentage" ? "percentage" : "fixed",
			rewardValue:
				Number.isInteger(rewardValue) &&
				rewardValue >= 0 &&
				rewardValue <= 1_000_000
					? rewardValue
					: 0,
		},
	};
}
