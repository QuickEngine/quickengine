import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { MutationUnitOfWork } from "@quickengine/api-contracts/mutations";
import type { CacheProvider } from "@quickengine/cache";
import type { DatabaseTransaction } from "@quickengine/db";
import {
	CheckoutError,
	checkoutInputSchema,
	completeReferralsForOrder,
	createOrderCommand,
	evaluateDiscount,
	evaluateReferral,
	priceCheckout,
	readOrdersSettings,
	recordReferral,
	redeemDiscount,
	resolveCheckoutClient,
	taxCalculatorFor,
} from "@quickengine/mod-orders";
import {
	captureCheckoutPayment,
	getPaymentAccount,
	getPaymentProvider,
	readPaymentAccount,
	recordPendingCheckoutPayment,
} from "@quickengine/mod-payments";
import {
	priceChosenRate,
	quoteShipping,
	ShippingQuoteError,
	shippingDestinationSchema,
} from "@quickengine/mod-shipping";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { ApiLogger } from "./logger";
import { buildMutationContext } from "./mutation-policy";
import { respondMutation } from "./mutation-response";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

/**
 * `/v1/checkout` — the route a merchant's own website calls to sell something.
 *
 * 🔴 This is the only write reachable with a credential that ships in page
 * source, so it is the most exposed handler in the system. Two properties keep
 * it safe, and both are enforced elsewhere on purpose:
 *
 * 1. **The caller cannot name a price.** `checkoutInputSchema` has no money
 *    field at all; `priceCheckout` reads the catalog inside the workspace scope.
 * 2. **The caller cannot name a buyer.** No `clientId` is accepted — the client
 *    record is resolved from the email being checked out with. The old prototype
 *    accepted one and never checked it belonged to the storefront, which let one
 *    shop attach orders to another shop's customer.
 *
 * Order first, then charge. The order is created as a draft and only becomes
 * `placed` when the provider confirms payment. Charging first and creating
 * afterwards means a failure between the two takes somebody's money with no
 * record of what they bought — the one outcome that cannot be repaired
 * automatically.
 */
export function registerCheckoutRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		uow: MutationUnitOfWork<DatabaseTransaction>;
	},
) {
	const access = authorizeWorkspace(options.platform, {
		keyCapability: "checkout:write",
		module: "orders",
		// A session-authenticated operator may also check out — useful for a phone
		// order taken by staff. They need the ordinary write capability for it.
		sessionCapability: "records.write",
	});

	// Its own bucket. A storefront under attack must not exhaust the limiter its
	// operator relies on to run the business.
	const limit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "checkout.write",
	});

	const quoteInputSchema = z.object({
		items: checkoutInputSchema.shape.items,
		destination: shippingDestinationSchema,
		discountCode: checkoutInputSchema.shape.discountCode,
	});
	const providerPaymentIdSchema = z.string().trim().min(1).max(255);

	app.post(
		"/v1/checkout/:externalPaymentId/capture",
		access,
		limit,
		async (c) => {
			const externalPaymentId = providerPaymentIdSchema.parse(
				c.req.param("externalPaymentId"),
			);
			const result = await captureCheckoutPayment({
				workspaceId: c.get("authorized").workspaceId,
				externalPaymentId,
			});
			if (!result.captured) {
				return respondError(c, "NOT_FOUND", result.reason, 404);
			}
			if (result.settlement.applied) {
				await completeReferralsForOrder({
					workspaceId: result.settlement.workspaceId,
					orderId: result.settlement.orderId,
				});
			}
			return respond(c, result);
		},
	);

	app.post("/v1/shipping/quote", access, limit, async (c) => {
		const parsed = quoteInputSchema.safeParse(await c.req.json());
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"The delivery quote could not be read.",
				400,
				parsed.error.issues,
			);
		}
		const { workspaceId } = c.get("authorized");
		try {
			const priced = await priceCheckout(workspaceId, parsed.data.items);
			let discountCents = 0;
			if (parsed.data.discountCode) {
				const discount = await evaluateDiscount({
					workspaceId,
					code: parsed.data.discountCode,
					subtotalCents: priced.subtotalCents,
				});
				if (!discount.ok)
					return respondError(c, "VALIDATION_ERROR", discount.message, 400);
				discountCents = discount.amountCents;
			}
			return respond(
				c,
				await quoteShipping({
					workspaceId,
					discountedSubtotalCents: Math.max(
						0,
						priced.subtotalCents - discountCents,
					),
					quote: {
						destination: parsed.data.destination,
						lines: parsed.data.items.map((item) => ({
							catalogItemId: item.catalogItemId,
							catalogItemVariantId: item.variantId ?? null,
							quantity: item.quantity,
						})),
					},
				}),
			);
		} catch (error) {
			if (
				error instanceof CheckoutError ||
				error instanceof ShippingQuoteError
			) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					error.message,
					400,
					error instanceof ShippingQuoteError ? error.detail : undefined,
				);
			}
			throw error;
		}
	});

	app.post("/v1/checkout", access, limit, async (c: Context<PlatformEnv>) => {
		const parsed = checkoutInputSchema.safeParse(await c.req.json());
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"The checkout could not be read.",
				400,
				parsed.error.issues,
			);
		}

		const { workspaceId } = c.get("authorized");

		let priced: Awaited<ReturnType<typeof priceCheckout>>;
		try {
			priced = await priceCheckout(workspaceId, parsed.data.items);
		} catch (error) {
			if (error instanceof CheckoutError) {
				// 400, not 500. The request named something unbuyable, which is the
				// caller's problem and is expected traffic on a public storefront —
				// a catalog changes while somebody has a page open.
				return respondError(c, "VALIDATION_ERROR", error.message, 400);
			}
			throw error;
		}

		// ── Discount ───────────────────────────────────────────────────────────
		// Evaluated against the subtotal WE priced, never one the caller sent.
		let discount: Awaited<ReturnType<typeof evaluateDiscount>> | null = null;
		if (parsed.data.discountCode) {
			discount = await evaluateDiscount({
				workspaceId,
				code: parsed.data.discountCode,
				subtotalCents: priced.subtotalCents,
			});
			if (!discount.ok) {
				// 400 with the shopper-facing reason. A bad code is expected traffic on
				// a public storefront, not a server fault.
				return respondError(c, "VALIDATION_ERROR", discount.message, 400);
			}
		}

		// Tax from the workspace's own settings, never from the request. Whoever
		// computes it, the caller does not.
		const settings = await readOrdersSettings(workspaceId);
		// 🔴 Tax is computed on the DISCOUNTED subtotal. Taxing the full amount and
		// then discounting would charge tax on money the customer never paid, which
		// is both wrong and, on a remittance, somebody else's money.
		const discountCents = discount?.ok ? discount.amountCents : 0;
		const physical = priced.lines.some((line) => line.type === "physical");
		if (
			physical &&
			(!parsed.data.shippingAddress || !parsed.data.shippingRateId)
		) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"A delivery address and delivery option are required for physical items.",
				400,
			);
		}
		if (
			!physical &&
			(parsed.data.shippingAddress || parsed.data.shippingRateId)
		) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Delivery may only be selected for an order containing physical items.",
				400,
			);
		}
		let shipping: Awaited<ReturnType<typeof priceChosenRate>> | null = null;
		if (physical && parsed.data.shippingAddress && parsed.data.shippingRateId) {
			try {
				shipping = await priceChosenRate({
					workspaceId,
					rateId: parsed.data.shippingRateId,
					discountedSubtotalCents: Math.max(
						0,
						priced.subtotalCents - discountCents,
					),
					quote: {
						destination: {
							countryCode: parsed.data.shippingAddress.countryCode,
							regionCode: parsed.data.shippingAddress.region,
							postalCode: parsed.data.shippingAddress.postalCode,
						},
						lines: parsed.data.items.map((item) => ({
							catalogItemId: item.catalogItemId,
							catalogItemVariantId: item.variantId ?? null,
							quantity: item.quantity,
						})),
					},
				});
			} catch (error) {
				if (error instanceof ShippingQuoteError)
					return respondError(
						c,
						"VALIDATION_ERROR",
						error.message,
						400,
						error.detail,
					);
				throw error;
			}
		}
		const taxableCents =
			Math.max(0, priced.subtotalCents - discountCents) +
			(shipping?.amountCents ?? 0);
		const taxCents = await taxCalculatorFor(settings).calculate({
			subtotalCents: taxableCents,
			currency: priced.currency,
		});

		const client = await resolveCheckoutClient({
			workspaceId,
			email: parsed.data.email,
			name: parsed.data.name,
		});

		// The durable write: order, idempotency, audit and outbox in one
		// transaction. An idempotency key is honoured if the caller sent one, which
		// is what stops a double-tapped buy button becoming two orders.
		const context = await buildMutationContext({
			authorized: c.get("authorized"),
			abortSignal: c.get("abortSignal"),
			canonicalInput: { ...parsed.data, subtotalCents: priced.subtotalCents },
			deadlineAtMs: c.get("deadlineAtMs"),
			idempotencyKey: c.req.header(API_HEADERS.idempotencyKey),
			operation: "checkout.create",
			requestId: c.get("requestId"),
		});

		const result = await createOrderCommand(
			context,
			{
				clientId: client.id,
				currency: priced.currency,
				discountCents,
				discountCode: discount?.ok ? discount.code : null,
				taxCents,
				shippingCents: shipping?.amountCents ?? 0,
				shippingRateId: shipping?.rateId ?? null,
				shippingRateName: shipping?.name ?? null,
				shipToName: parsed.data.shippingAddress?.name ?? null,
				shipToLine1: parsed.data.shippingAddress?.line1 ?? null,
				shipToLine2: parsed.data.shippingAddress?.line2 ?? null,
				shipToCity: parsed.data.shippingAddress?.city ?? null,
				shipToRegion: parsed.data.shippingAddress?.region ?? null,
				shipToPostalCode: parsed.data.shippingAddress?.postalCode ?? null,
				shipToCountryCode: parsed.data.shippingAddress?.countryCode ?? null,
				notes: parsed.data.notes ?? null,
				lines: priced.lines.map((line) => ({
					catalogItemId: line.catalogItemId,
					catalogItemVariantId: line.catalogItemVariantId,
					name: line.name,
					type: line.type,
					sku: line.sku,
					quantity: line.quantity,
					unitPriceCents: line.unitPriceCents,
				})),
				metadata: {},
			},
			options.uow,
		);

		// A replayed idempotent request returns the original order rather than
		// creating a second one, which is what makes a double-tapped buy button
		// safe. Conflict and in-progress are handed back as-is.
		if (result.kind !== "success") {
			return respondMutation(c, result);
		}
		const order = result.result;

		// A referral records WHO BROUGHT this customer. It does not change what the
		// order costs — the reward accrues to the referrer, and only once this order
		// settles. Failure here must never fail the sale, so it is best-effort and
		// logged.
		if (parsed.data.referralCode) {
			try {
				const referral = await evaluateReferral({
					workspaceId,
					code: parsed.data.referralCode,
					referredClientRecordId: client.id,
					settings: settings.referrals,
					orderSubtotalCents: priced.subtotalCents,
				});
				if (referral.ok) {
					await recordReferral({
						workspaceId,
						referralCodeId: referral.referralCodeId,
						referrerClientRecordId: referral.referrerClientRecordId,
						referredClientRecordId: client.id,
						orderId: order.id,
						rewardType: referral.rewardType,
						rewardAmountCents: referral.rewardAmountCents,
					});
				} else {
					options.logger.info("checkout.referral_rejected", {
						reason: referral.reason,
						orderId: order.id,
						requestId: c.get("requestId"),
					});
				}
			} catch (error) {
				// 🔴 Swallowed deliberately. A referral programme misfiring must not
				// lose the shop a sale that has already been priced and charged.
				options.logger.error("checkout.referral_failed", {
					error,
					orderId: order.id,
					requestId: c.get("requestId"),
				});
			}
		}

		// 🔴 Spend the redemption AFTER the order exists, and only then.
		//
		// ⚠️ This is outside the order's transaction, which is a known compromise:
		// `createOrderCommand` owns that transaction and does not accept extra
		// work. The consequence is a narrow window where an order carries a
		// discount whose redemption was not recorded — which UNDER-counts usage
		// (a code could be used once more than its cap) rather than over-counting,
		// and never charges anybody wrongly. The reverse order would burn a
		// redemption on an order that failed to write, which is worse.
		//
		// Tracked in TECH_DEBT: the real fix is threading the redemption into the
		// unit of work.
		if (discount?.ok) {
			const spent = await redeemDiscount({
				workspaceId,
				discountId: discount.discountId,
				clientRecordId: client.id,
				orderId: order.id,
				amountCents: discount.amountCents,
			});
			if (!spent) {
				options.logger.warn("checkout.discount_exhausted_after_order", {
					orderId: order.id,
					code: discount.code,
					requestId: c.get("requestId"),
				});
			}
		}

		// ── Payment ───────────────────────────────────────────────────────────
		// A workspace that has not connected an account can still take the order;
		// it simply cannot be paid online. That is a real case — a business
		// invoicing afterwards, or taking cash on collection — and refusing the
		// order would lose it entirely.
		const account = await readPaymentAccount(workspaceId);
		if (!account.connected || !account.chargesEnabled) {
			return respond(
				c,
				{
					order,
					payment: null,
					// Said plainly so a storefront can show something useful instead of
					// a blank payment step.
					paymentUnavailableReason: account.connected
						? "The business has not finished connecting its payment account."
						: "The business has not connected a payment account.",
				},
				201,
			);
		}

		const stored = await getPaymentAccount(workspaceId);
		const externalAccountId = stored?.stripeAccountId ?? null;
		if (!externalAccountId) {
			return respond(
				c,
				{
					order,
					payment: null,
					paymentUnavailableReason: "No payment account.",
				},
				201,
			);
		}

		const charge = await getPaymentProvider(account.provider).createCharge({
			amountCents: order.totalCents,
			currency: priced.currency,
			connectedAccountId: externalAccountId,
			// Platform fee stays zero until a workspace has one agreed. Metering
			// charges infrastructure, never a business outcome.
			applicationFeeCents: 0,
			metadata: { orderId: order.id, orderNumber: order.number, workspaceId },
		});

		// 🔴 The row that links the provider's payment id to this order. Without it
		// the settlement webhook arrives valid and signed with nowhere to apply
		// itself, and the order stays a draft while the money moves.
		await recordPendingCheckoutPayment({
			workspaceId,
			orderId: order.id,
			clientId: client.id,
			clientEmail: parsed.data.email,
			externalPaymentId: charge.externalPaymentId,
			provider: account.provider,
			amountCents: order.totalCents,
			currency: priced.currency,
		});

		return respond(
			c,
			{
				order,
				payment: {
					provider: account.provider,
					externalPaymentId: charge.externalPaymentId,
					// A discriminated browser step: Stripe supplies a client secret,
					// PayPal supplies an approval token, and a hosted provider may supply
					// a redirect. The storefront never has to guess from nullable fields.
					nextAction: charge.nextAction,
				},
			},
			201,
		);
	});
}
