import { getStripePriceId, PLANS } from "@quickengine/billing";

// Exposes the plan config so the (client) billing test page stays in sync with
// the single source of truth in @quickengine/billing rather than duplicating it.
export function GET(): Response {
	const plans = PLANS.map((plan) => ({
		id: plan.id,
		displayName: plan.displayName,
		free: plan.free,
		monthly: Boolean(getStripePriceId(plan.id, "monthly")),
		annual: Boolean(getStripePriceId(plan.id, "annual")),
	}));
	return Response.json({ plans });
}
