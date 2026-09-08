import { getSession } from "@quickengine/auth/server";
import {
	getStoragePackHolding,
	getStripePriceId,
	getSubscriptionForOrg,
	MAX_STORAGE_PACKS,
	SELLABLE_PLANS,
	STORAGE_PACKS,
	type StoragePackId,
	setStoragePack,
} from "@quickengine/billing";
import { resolveOrgRole } from "@quickengine/db";
import type { Hono } from "hono";
import { z } from "zod";
import type { PlatformEnv } from "./platform-types";

/**
 * What the storage add-on should BE, not what to add to it.
 *
 * 🔴 Absolute rather than incremental so a retried request cannot sell the same
 * storage twice. `packId: null` removes the add-on, which is also what a
 * quantity of zero means.
 *
 * Exported because `openapi-requests.ts` documents the route with this exact
 * schema. A hand-written body in the document drifts from the validator the
 * first time somebody adds a field, and the document then lies with confidence.
 */
export const storageAddOnInputSchema = z.object({
	organizationId: z.uuid(),
	packId: z.enum(["small", "medium", "large"]).nullable(),
	quantity: z.number().int().min(0).max(MAX_STORAGE_PACKS),
});

/**
 * Read-only billing information.
 *
 * Moved here from the marketing app during the Vite migration. Both endpoints
 * existed and are preserved rather than dropped: the migration is a change of
 * framework, not a change of what the product does.
 *
 * They deliberately do **not** use `authorizeWorkspace` — neither is
 * workspace-scoped. Plans are public configuration, and a subscription belongs to
 * an organization.
 */
export function registerBillingInfoRoutes(app: Hono<PlatformEnv>) {
	/**
	 * The plan ladder as configured, so a pricing page never hardcodes a second
	 * copy of it that can drift from `@quickengine/billing`.
	 *
	 * Public: it is the same information printed on the pricing page. It exposes
	 * whether a Stripe price is *configured*, never the price id itself.
	 */
	app.get("/v1/billing/plans", (c) =>
		c.json({
			plans: SELLABLE_PLANS.map((plan) => ({
				id: plan.id,
				displayName: plan.displayName,
				free: plan.free,
				monthly: Boolean(getStripePriceId(plan.id, "monthly")),
				annual: Boolean(getStripePriceId(plan.id, "annual")),
			})),
		}),
	);

	/**
	 * An organization's current subscription. Billing is org-scoped, so the caller
	 * passes the organization and must be a member of it.
	 */
	app.get("/v1/billing/subscription", async (c) => {
		const session = await getSession(c.req.raw.headers);
		if (!session) {
			// Not an error: the marketing and account surfaces both ask this before
			// they know whether anyone is signed in.
			return c.json({ signedIn: false, email: null, subscription: null });
		}

		const organizationId = c.req.query("organizationId");
		if (!organizationId) {
			return c.json({ error: "organizationId is required." }, 400);
		}

		// Membership is the check, not ownership — any member may see what the
		// organization is paying for.
		const role = await resolveOrgRole(session.user.id, organizationId);
		if (!role) return c.json({ error: "Forbidden." }, 403);

		return c.json({
			signedIn: true,
			email: session.user.email,
			subscription: (await getSubscriptionForOrg(organizationId)) ?? null,
		});
	});

	/**
	 * The storage ladder, as configured.
	 *
	 * Public for the same reason the plan list is: it is what the pricing page
	 * prints. Reports whether each price is *wired*, never the price id.
	 */
	app.get("/v1/billing/storage-packs", (c) =>
		c.json({
			maxQuantity: MAX_STORAGE_PACKS,
			packs: STORAGE_PACKS.map((pack) => ({
				id: pack.id,
				bytes: pack.bytes,
				cents: pack.cents,
				monthly: Boolean(process.env[pack.priceEnv.monthly]),
				annual: Boolean(process.env[pack.priceEnv.annual]),
			})),
		}),
	);

	/** What an organization currently holds. Any member may see it. */
	app.get("/v1/billing/storage", async (c) => {
		const session = await getSession(c.req.raw.headers);
		if (!session) return c.json({ error: "Unauthorized." }, 401);

		const organizationId = c.req.query("organizationId");
		if (!organizationId) {
			return c.json({ error: "organizationId is required." }, 400);
		}
		const role = await resolveOrgRole(session.user.id, organizationId);
		if (!role) return c.json({ error: "Forbidden." }, 403);

		return c.json(await getStoragePackHolding(organizationId));
	});

	/**
	 * Buy, change or drop the storage add-on.
	 *
	 * 🔴 Owners and admins only, unlike the read above. Any member may SEE what
	 * the organization pays for; changing it puts a recurring charge on somebody
	 * else's card.
	 *
	 * ⚠️ Absolute, not incremental: the body says what the holding should BE. A
	 * retried request therefore cannot sell the same storage twice, which an
	 * "add one pack" shape would.
	 */
	app.post("/v1/billing/storage", async (c) => {
		const session = await getSession(c.req.raw.headers);
		if (!session) return c.json({ error: "Unauthorized." }, 401);

		const parsed = storageAddOnInputSchema.safeParse(
			await c.req.json().catch(() => null),
		);
		if (!parsed.success) {
			return c.json(
				{
					error: `Choose a storage pack and a quantity up to ${MAX_STORAGE_PACKS}.`,
				},
				400,
			);
		}
		const { organizationId, packId, quantity } = parsed.data;

		const role = await resolveOrgRole(session.user.id, organizationId);
		if (role !== "owner" && role !== "admin") {
			return c.json({ error: "Forbidden." }, 403);
		}

		const result = await setStoragePack({ organizationId, packId, quantity });
		if (result.ok) return c.json(result);

		/**
		 * Says what to do, not what failed. Somebody hitting `no_subscription` is
		 * on the free tier, where storage past the allowance is already charged at
		 * the small pack's own rate, so there is nothing they need to buy and the
		 * answer should say so rather than reading as a fault.
		 */
		const explain: Record<typeof result.reason, string> = {
			no_subscription:
				"Extra storage is an add-on to a paid plan. On the free plan you are already charged the same rate for the storage you use, so there is nothing to buy.",
			subscription_inactive:
				"Your subscription is not active, so it cannot take an add-on. Update your payment details and try again.",
			price_not_configured:
				"That storage pack is not available for purchase yet.",
			quantity_out_of_range: `Choose between 0 and ${MAX_STORAGE_PACKS} packs.`,
			stripe_unavailable:
				"Billing is unavailable right now. Try again shortly.",
		};
		return c.json(
			{ error: explain[result.reason], reason: result.reason },
			result.reason === "quantity_out_of_range" ? 400 : 409,
		);
	});
}
