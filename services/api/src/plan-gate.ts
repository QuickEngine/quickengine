import type { PlanCapability } from "@quickengine/billing";
import type { MiddlewareHandler } from "hono";
import type { PlatformEnv } from "./platform-types";
import { respondError } from "./respond";

/**
 * The gate between the free product and the paid one.
 *
 * 🔴 There is exactly ONE capability today, and that is deliberate. Every module
 * is available on every tier: a business running on its own gets the whole
 * single-merchant system for nothing, because none of it costs us anything to
 * run and a crippled free tier teaches people the product is mean. The line is
 * drawn where the work actually is — suppliers, purchase orders and partner
 * payouts, the settlement machinery that answers who is owed what when somebody
 * other than the merchant is involved.
 *
 * ⚠️ Never put this on a PUBLIC route. `GET /v1/partner-links/:code` is how a
 * storefront resolves a referral link for an anonymous shopper; gating it would
 * break live sites the moment a subscription lapsed, and would punish the
 * shopper for the merchant's billing. Operator surfaces are gated; the customer
 * channel never is.
 *
 * ⚠️ Reads the subscription every request rather than caching. Correct by
 * default: a lapsed plan must lose the capability immediately, and this sits on
 * a handful of low-traffic operator routes rather than the hot path.
 */
export function requireCapability(
	capability: PlanCapability,
	explanation: string,
): MiddlewareHandler<PlatformEnv> {
	return async (c, next) => {
		const organizationId = c.get("authorized")?.workspace.organizationId;
		if (!organizationId) {
			// No organization means no subscription to read. Fail closed.
			return respondError(c, "PLAN_UPGRADE_REQUIRED", explanation, 402);
		}

		const { hasCapability } = await import("@quickengine/billing");
		if (await hasCapability(organizationId, capability)) {
			return next();
		}

		return respondError(c, "PLAN_UPGRADE_REQUIRED", explanation, 402);
	};
}

/**
 * The one gate that exists, with the sentence a customer actually reads.
 *
 * Written as a plain statement of what the plan includes rather than a refusal.
 * This is the moment somebody decides whether to pay, so it says what they get,
 * not what they did wrong.
 */
export const requireSecondParty = requireCapability(
	"second-party",
	"Partners and suppliers are part of Commerce: purchase orders, supplier payments and partner payouts. Your current plan covers everything you sell on your own.",
);
