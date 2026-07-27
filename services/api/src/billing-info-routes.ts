import { getSession } from "@quickengine/auth/server";
import {
	getStripePriceId,
	getSubscriptionForOrg,
	PLANS,
} from "@quickengine/billing";
import { resolveOrgRole } from "@quickengine/db";
import type { Hono } from "hono";
import type { PlatformEnv } from "./platform-types";

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
			plans: PLANS.map((plan) => ({
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
}
