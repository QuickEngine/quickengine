import {
	CheckoutError,
	evaluateDiscount,
	priceCheckout,
	readOrdersSettings,
	SubscriptionError,
	subscriptionPlanContents,
	taxCalculatorFor,
} from "@quickengine/mod-orders";
import { priceChosenRate, ShippingQuoteError } from "@quickengine/mod-shipping";

/**
 * What an order costs, worked out once, in one place.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 The storefront could not know the total until it had already committed the
 * order. Tax comes from the workspace's settings and depends on the delivery
 * address, so a browser has no way to compute it — which left the checkout
 * showing `AUTHORIZE $12.50` on a charge of `$13.12`.
 *
 * A button labelled with an amount is the moment a shopper CONSENTS. A different
 * amount leaving their account is not a rounding detail; it is a support message
 * at best and a chargeback at worst, and the customer is right both times.
 *
 * 🔑 **One function, two callers, so they cannot disagree.** The quote route and
 * the checkout route run exactly this code. The alternative — handing the tax
 * rate to the browser — works fine at one flat rate and silently charges the
 * wrong amount the day tax becomes per-jurisdiction, which is the direction
 * every tax system moves.
 *
 * ⚠️ Prices, and does NOTHING else. No order, no reservation, no payment, no
 * discount redemption. A quote must be free to ask for repeatedly as somebody
 * edits their basket.
 */
export type CheckoutQuoteInput = {
	workspaceId: string;
	items?: Array<{
		catalogItemId: string;
		variantId?: string | null;
		quantity: number;
	}>;
	subscriptionPlanId?: string | null;
	discountCode?: string | null;
	shippingRateId?: string | null;
	shippingAddress?: {
		countryCode: string;
		region?: string | null;
		postalCode?: string | null;
	} | null;
	/**
	 * The currency the SHOPPER is looking at, if it is not the catalog's.
	 *
	 * 🔴 A shop that displays USD and charges CAD has the same consent problem as
	 * one that displays a total without tax: somebody agrees to one number and a
	 * different one leaves their account. Naming the presentment currency here
	 * means the quote and the charge are converted by the same code, once.
	 */
	presentmentCurrency?: string | null;
};

export type CheckoutQuote = {
	currency: string;
	lines: Awaited<ReturnType<typeof priceCheckout>>["lines"];
	subtotalCents: number;
	discountCents: number;
	discountCode: string | null;
	shippingCents: number;
	shippingRateId: string | null;
	shippingRateName: string | null;
	taxCents: number;
	totalCents: number;
	/** Whether anything in the basket has to be delivered. */
	physical: boolean;
	/**
	 * What the shopper is charged, when that is not the catalog currency.
	 *
	 * ⚠️ Present ONLY when a conversion actually happened, so a caller cannot
	 * accidentally render a "converted" total identical to the real one and imply
	 * a conversion that never took place.
	 */
	presentment?: {
		currency: string;
		totalCents: number;
		rate: number;
		asOf: string;
	};
};

/**
 * A refusal a SHOPPER should see, carried rather than thrown.
 *
 * ⚠️ Every one of these is expected traffic on a public storefront — a catalog
 * changes while somebody has a page open, a code expires, a rate stops applying.
 * None is a server fault, so none may surface as one.
 */
export type CheckoutQuoteRefusal = {
	ok: false;
	message: string;
	detail?: unknown;
};

export type CheckoutQuoteResult =
	| ({ ok: true } & CheckoutQuote)
	| CheckoutQuoteRefusal;

/**
 * 🔴 What tax is charged ON, and the one line that must never be written twice.
 *
 * Every other part of the arithmetic already lives in a shared function —
 * `priceCheckout`, `evaluateDiscount`, `priceChosenRate`, `taxCalculatorFor`.
 * This is the orchestration between them, and it is where a divergence would
 * actually happen: tax the full subtotal instead of the discounted one and the
 * customer is charged tax on money they never paid, which on a remittance is
 * somebody else's money.
 *
 * ⚠️ Exported so `/v1/checkout` and `/v1/checkout/quote` cannot disagree about
 * it. If those two ever produce different totals, the customer agreed to one
 * number and was charged another.
 */
export function taxableAmountCents(input: {
	subtotalCents: number;
	discountCents: number;
	shippingCents: number;
}): number {
	// Never negative: a discount larger than the basket must not make delivery
	// free and then start refunding tax.
	return (
		Math.max(0, input.subtotalCents - input.discountCents) + input.shippingCents
	);
}

export async function quoteCheckout(
	input: CheckoutQuoteInput,
): Promise<CheckoutQuoteResult> {
	const { workspaceId } = input;

	/**
	 * A subscription supplies its own contents.
	 *
	 * 🔑 Resolved to real catalog lines and then priced by exactly the same code
	 * an ordinary basket goes through, so nothing downstream learns subscriptions
	 * exist.
	 *
	 * ⚠️ The plan's own price is NOT the total. The order is priced from its
	 * lines, so a plan whose contents changed cannot quietly charge yesterday's
	 * amount for today's box.
	 */
	let subscriptionLines: Array<{
		catalogItemId: string;
		quantity: number;
	}> | null = null;
	if (input.subscriptionPlanId) {
		try {
			const { contents } = await subscriptionPlanContents(
				workspaceId,
				input.subscriptionPlanId,
			);
			subscriptionLines = contents.map(
				(line: { catalogItemId: string; quantity: number }) => ({
					catalogItemId: line.catalogItemId,
					quantity: line.quantity,
				}),
			);
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return {
					ok: false,
					message:
						error.message === "SUBSCRIPTION_PLAN_NOT_FOUND"
							? "That subscription is no longer offered."
							: "That subscription has nothing in it, so there is nothing to send.",
				};
			}
			throw error;
		}
	}

	let priced: Awaited<ReturnType<typeof priceCheckout>>;
	try {
		priced = await priceCheckout(
			workspaceId,
			subscriptionLines ?? input.items ?? [],
		);
	} catch (error) {
		if (error instanceof CheckoutError) {
			return { ok: false, message: error.message };
		}
		throw error;
	}

	// ── Discount ─────────────────────────────────────────────────────────────
	// Evaluated against the subtotal WE priced, never one the caller sent.
	let discountCents = 0;
	let discountCode: string | null = null;
	if (input.discountCode) {
		const discount = await evaluateDiscount({
			workspaceId,
			code: input.discountCode,
			subtotalCents: priced.subtotalCents,
		});
		if (!discount.ok) return { ok: false, message: discount.message };
		discountCents = discount.amountCents;
		discountCode = discount.code;
	}

	const physical = priced.lines.some((line) => line.type === "physical");

	// ── Delivery ─────────────────────────────────────────────────────────────
	/**
	 * ⚠️ Unlike the checkout route, a quote does NOT insist on an address.
	 *
	 * Somebody is typing. Asking for a total before they have chosen a delivery
	 * option is the normal case, and refusing would leave the page unable to show
	 * anything at all until the last step — which is the problem this exists to
	 * solve. Delivery simply reads as zero until it is known.
	 */
	let shippingCents = 0;
	let shippingRateName: string | null = null;
	let shippingRateId: string | null = null;
	if (physical && input.shippingAddress && input.shippingRateId) {
		try {
			const shipping = await priceChosenRate({
				workspaceId,
				rateId: input.shippingRateId,
				discountedSubtotalCents: Math.max(
					0,
					priced.subtotalCents - discountCents,
				),
				quote: {
					destination: {
						countryCode: input.shippingAddress.countryCode,
						regionCode: input.shippingAddress.region,
						postalCode: input.shippingAddress.postalCode,
					},
					lines: subscriptionLines
						? subscriptionLines.map((line) => ({
								catalogItemId: line.catalogItemId,
								catalogItemVariantId: null,
								quantity: line.quantity,
							}))
						: (input.items ?? []).map((item) => ({
								catalogItemId: item.catalogItemId,
								catalogItemVariantId: item.variantId ?? null,
								quantity: item.quantity,
							})),
				},
			});
			shippingCents = shipping.amountCents;
			shippingRateName = shipping.name;
			shippingRateId = shipping.rateId;
		} catch (error) {
			if (error instanceof ShippingQuoteError) {
				return { ok: false, message: error.message, detail: error.detail };
			}
			throw error;
		}
	}

	// ── Tax ──────────────────────────────────────────────────────────────────
	/**
	 * 🔴 Computed on the DISCOUNTED subtotal, plus delivery.
	 *
	 * Taxing the full amount and discounting afterwards charges tax on money the
	 * customer never paid — which is wrong, and on a remittance it is somebody
	 * else's money.
	 *
	 * From the workspace's own settings, never from the request. Whoever computes
	 * it, the caller does not.
	 */
	const settings = await readOrdersSettings(workspaceId);
	const taxableCents = taxableAmountCents({
		subtotalCents: priced.subtotalCents,
		discountCents,
		shippingCents,
	});
	const taxCents = await taxCalculatorFor(settings).calculate({
		subtotalCents: taxableCents,
		currency: priced.currency,
	});

	/**
	 * 🔑 Converted ONCE, on the total, at the very end.
	 *
	 * Converting each line and summing drifts from converting the sum — by a cent
	 * or two, every time, in whichever direction the rounding falls. The total is
	 * the number that is charged, so the total is the number that is converted.
	 */
	let presentment: CheckoutQuote["presentment"];
	const wanted = input.presentmentCurrency?.toUpperCase();
	if (wanted && wanted !== priced.currency.toUpperCase()) {
		const { exchangeRate, convertCents } = await import(
			"@quickengine/mod-orders"
		);
		const { rate, asOf } = await exchangeRate(priced.currency, wanted);
		presentment = {
			currency: wanted,
			totalCents: convertCents(taxableCents + taxCents, rate),
			rate,
			asOf: asOf.toISOString(),
		};
	}

	return {
		ok: true,
		currency: priced.currency,
		lines: priced.lines,
		subtotalCents: priced.subtotalCents,
		discountCents,
		discountCode,
		shippingCents,
		shippingRateId,
		shippingRateName,
		taxCents,
		totalCents: taxableCents + taxCents,
		physical,
		...(presentment ? { presentment } : {}),
	};
}
