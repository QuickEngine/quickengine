import { db, eq, quickengineWorkspaces } from "@quickengine/db";
import {
	archiveSubscriptionPlan,
	createDiscount,
	createSubscriptionPlan,
	deleteDiscount,
	discountInputSchema,
	discountPreviewInputSchema,
	evaluateDiscount,
	issuePartnerCode,
	listDiscounts,
	listPartnerCodes,
	listSubscriptionPlans,
	listSubscriptions,
	partnerLinkSchema,
	priceCheckout,
	resolvePartnerLink,
	SubscriptionError,
	setPartnerCodeActive,
	setSubscriptionStatus,
	subscriptionPlanInputSchema,
	updateDiscount,
} from "@quickengine/mod-orders";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { respond, respondError } from "./respond";

const uuid = z.uuid();

/**
 * A storefront asking "is this code any good, and what would it save me?"
 *
 * 🔴 Takes the CART, not a subtotal. The old prototype's equivalent accepted
 * `{ code, subtotal }` from the browser, which lets anyone claim a £10,000 order
 * to clear a minimum-spend threshold, or compute a percentage against a number
 * they invented. Here the server prices the same items it would price at
 * checkout, so the preview and the real thing cannot disagree.
 */
const previewSchema = discountPreviewInputSchema;

export function registerDiscountRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	/**
	 * Resolving a partner link is a public READ.
	 *
	 * 🔴 Lighter than `storefront` deliberately. The link is printed in somebody's
	 * bio — it is as public as the catalog — and requiring `checkout:write` to ask
	 * "is this code real" would mean a plain publishable key could not follow a
	 * link the business is actively advertising. It returns nothing a visitor
	 * could not learn by clicking.
	 */
	const publicRead = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:read",
		module: "orders",
		sessionCapability: "workspace.view",
	});
	const storefront = authorizeWorkspace(options.platform, {
		// Same capability the checkout uses — a site that may check out may ask
		// what a code is worth first.
		keyCapability: "checkout:write",
		module: "orders",
		sessionCapability: "records.write",
	});
	const read = authorizeWorkspace(options.platform, {
		keyCapability: "orders:read",
		module: "orders",
		sessionCapability: "workspace.view",
	});
	const write = authorizeWorkspace(options.platform, {
		keyCapability: "orders:write",
		module: "orders",
		sessionCapability: "records.write",
	});

	app.post("/v1/discounts/preview", storefront, async (c) => {
		const parsed = previewSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Send a code and the items in the basket.",
				400,
				parsed.error.issues,
			);
		}

		const { workspaceId } = c.get("authorized");
		const priced = await priceCheckout(workspaceId, parsed.data.items).catch(
			() => null,
		);
		if (!priced) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"One of those items is not available.",
				400,
			);
		}

		const result = await evaluateDiscount({
			workspaceId,
			code: parsed.data.code,
			subtotalCents: priced.subtotalCents,
		});

		// 200 either way. "Your code has expired" is a normal answer to a normal
		// question, not an error — and a storefront showing a red banner for an HTTP
		// failure would look broken rather than informative.
		return respond(
			c,
			result.ok
				? {
						valid: true,
						code: result.code,
						subtotalCents: priced.subtotalCents,
						discountCents: result.amountCents,
						totalAfterDiscountCents: priced.subtotalCents - result.amountCents,
						currency: priced.currency,
					}
				: { valid: false, reason: result.reason, message: result.message },
		);
	});

	// ── Operator management ─────────────────────────────────────────────────

	app.get("/v1/discounts", read, async (c) =>
		respond(c, { items: await listDiscounts(c.get("authorized").workspaceId) }),
	);

	app.post("/v1/discounts", write, async (c) => {
		const parsed = discountInputSchema.safeParse(
			await c.req.json().catch(() => ({})),
		);
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That discount could not be read.",
				400,
				parsed.error.issues,
			);
		}
		try {
			return respond(
				c,
				await createDiscount(c.get("authorized").workspaceId, parsed.data),
				201,
			);
		} catch (error) {
			return mapDiscountError(c, error);
		}
	});

	app.patch("/v1/discounts/:id", write, async (c) => {
		const parsed = discountInputSchema
			.partial()
			.safeParse(await c.req.json().catch(() => ({})));
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That discount could not be read.",
				400,
				parsed.error.issues,
			);
		}
		try {
			const row = await updateDiscount(
				c.get("authorized").workspaceId,
				uuid.parse(c.req.param("id")),
				parsed.data,
			);
			return row
				? respond(c, row)
				: respondError(c, "NOT_FOUND", "No such discount.", 404);
		} catch (error) {
			return mapDiscountError(c, error);
		}
	});

	app.delete("/v1/discounts/:id", write, async (c) => {
		const removed = await deleteDiscount(
			c.get("authorized").workspaceId,
			uuid.parse(c.req.param("id")),
		);
		return removed
			? respond(c, { deleted: true })
			: respondError(c, "NOT_FOUND", "No such discount.", 404);
	});

	/* ── Subscription plans ───────────────────────────────────────────────────
	 *
	 * 🔑 Under the orders module because a subscription IS a standing order: the
	 * same catalog, the same checkout, the same fulfilment. Giving it its own
	 * module would mean a business buying "subscriptions" separately from the
	 * ability to sell anything at all.
	 */

	/** What a shopper can subscribe to. Public: a storefront must render these. */
	app.get("/v1/subscription-plans", publicRead, async (c) =>
		respond(c, {
			items: await listSubscriptionPlans(c.get("authorized").workspaceId),
		}),
	);

	app.post("/v1/subscription-plans", write, async (c) => {
		try {
			return respond(
				c,
				await createSubscriptionPlan(
					c.get("authorized").workspaceId,
					subscriptionPlanInputSchema.parse(await c.req.json()),
				),
				201,
			);
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"One of those products is not in this workspace.",
					400,
				);
			}
			throw error;
		}
	});

	app.delete("/v1/subscription-plans/:id", write, async (c) => {
		try {
			return respond(
				c,
				await archiveSubscriptionPlan(
					c.get("authorized").workspaceId,
					uuid.parse(c.req.param("id")),
				),
			);
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return respondError(c, "NOT_FOUND", "That plan was not found.", 404);
			}
			throw error;
		}
	});

	/** Live subscriptions, for the operator. Filtered to the workspace's mode. */
	app.get("/v1/subscriptions", read, async (c) => {
		const [workspace] = await db
			.select({ environment: quickengineWorkspaces.environment })
			.from(quickengineWorkspaces)
			.where(eq(quickengineWorkspaces.id, c.get("authorized").workspaceId))
			.limit(1);
		return respond(c, {
			items: await listSubscriptions(
				c.get("authorized").workspaceId,
				workspace?.environment ?? "live",
			),
		});
	});

	/**
	 * Pause, resume or cancel.
	 *
	 * ⚠️ Cancelling stops future cycles; it never touches orders already placed.
	 * A subscription is an agreement about the future, and rewriting the past
	 * would remove revenue the business actually earned.
	 */
	app.patch("/v1/subscriptions/:id", write, async (c) => {
		const { status } = z
			.object({ status: z.enum(["active", "paused", "cancelled"]) })
			.parse(await c.req.json());
		try {
			return respond(
				c,
				await setSubscriptionStatus({
					workspaceId: c.get("authorized").workspaceId,
					id: uuid.parse(c.req.param("id")),
					status,
				}),
			);
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return respondError(
					c,
					"NOT_FOUND",
					"That subscription was not found.",
					404,
				);
			}
			throw error;
		}
	});

	/* ── Partner links ────────────────────────────────────────────────────────
	 *
	 * 🔑 A creator's link is a REFERRAL that happens to carry a discount, not a
	 * new kind of discount. `referral_codes` already models an owner, attributed
	 * orders and accrued earnings; reusing it means checkout, order totals and
	 * every report over them need no new concept.
	 */

	/**
	 * Resolve a code arriving from `yoursite.com/<code>`.
	 *
	 * 🔴 Public by construction — the code IS the link, so anybody holding it can
	 * call this. That is why it returns only whether the code works and the
	 * discount it carries: never the owner, their commission, or their earnings.
	 * Those are commercial terms between the business and its partner.
	 *
	 * ⚠️ Answers 200 with `null` for an unknown or retired code rather than 404.
	 * A dead link should land somebody on the shop, not on an error page: they
	 * came to buy coffee, and the state of an affiliate arrangement is not their
	 * problem.
	 */
	/** Every partner code, with what it has earned. Operator only. */
	app.get("/v1/partner-links", read, async (c) =>
		respond(c, {
			items: await listPartnerCodes(c.get("authorized").workspaceId),
		}),
	);

	/** Retire or restore one, without erasing what it already earned. */
	app.patch("/v1/partner-links/:id", write, async (c) => {
		const { active } = z
			.object({ active: z.boolean() })
			.parse(await c.req.json());
		try {
			return respond(
				c,
				await setPartnerCodeActive({
					workspaceId: c.get("authorized").workspaceId,
					id: uuid.parse(c.req.param("id")),
					active,
				}),
			);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message === "REFERRAL_CODE_NOT_FOUND"
			) {
				return respondError(c, "NOT_FOUND", "That code was not found.", 404);
			}
			throw error;
		}
	});

	app.get("/v1/partner-links/:code", publicRead, async (c) =>
		respond(c, {
			link: await resolvePartnerLink({
				workspaceId: c.get("authorized").workspaceId,
				code: c.req.param("code"),
			}),
		}),
	);

	/** Issue a code to a named partner. Operator only. */
	app.post("/v1/partner-links", write, async (c) => {
		const input = partnerLinkSchema.parse(await c.req.json());
		try {
			return respond(
				c,
				await issuePartnerCode({
					workspaceId: c.get("authorized").workspaceId,
					...input,
				}),
				201,
			);
		} catch (error) {
			if (error instanceof Error && error.message === "REFERRAL_CODE_TAKEN") {
				return respondError(
					c,
					"CONFLICT",
					"That code is already in use in this workspace.",
					409,
				);
			}
			if (error instanceof Error && error.message === "REFERRAL_CODE_INVALID") {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"A code may use letters, numbers and hyphens only, and becomes part of a web address.",
					400,
				);
			}
			throw error;
		}
	});
}

function mapDiscountError(
	c: Parameters<typeof respondError>[0],
	error: unknown,
) {
	if (error instanceof Error) {
		if (error.message === "DISCOUNT_WINDOW_INVALID") {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That discount ends before it starts.",
				400,
			);
		}
		// Unique violation on (workspace, code) — Drizzle wraps driver errors, so
		// match the SQLSTATE on the cause chain rather than the message. See
		// DB_RULES.
		for (
			let cause: unknown = error, depth = 0;
			cause && depth < 5;
			depth += 1
		) {
			if ((cause as { code?: string }).code === "23505") {
				return respondError(
					c,
					"CONFLICT",
					"You already have a discount with that code.",
					409,
				);
			}
			cause = (cause as { cause?: unknown }).cause;
		}
	}
	throw error;
}
