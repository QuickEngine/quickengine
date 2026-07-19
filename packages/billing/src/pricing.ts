import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";
import { getStripePriceId, PLANS, type PlanLimits } from "./plans";
import { getStripe, isStripeConfigured } from "./stripe";

// A tier's price for one cycle, sourced from Stripe (never hardcoded). `amount` is in
// the currency's minor unit (cents); null means no price is configured for that cycle.
export type CyclePrice = { amount: number; currency: string } | null;

export type PlanPricing = {
	planId: string;
	displayName: string;
	free: boolean;
	monthly: CyclePrice;
	annual: CyclePrice;
	limits: PlanLimits;
};

// Display pricing for every plan, with amounts read live from Stripe via the configured
// price IDs — so what a tier costs is whatever it's set to in Stripe, with zero code change.
// Unconfigured prices (or Stripe not set up) come back null and the UI shows them as such.
export async function getPlanPricing(): Promise<PlanPricing[]> {
	const stripe = isStripeConfigured() ? getStripe() : null;
	const cache = new Map<string, CyclePrice>();

	async function priceFor(
		planId: QuickEnginePlanId,
		cycle: QuickEngineBillingCycle,
	): Promise<CyclePrice> {
		const id = getStripePriceId(planId, cycle);
		if (!id || !stripe) return null;
		const cached = cache.get(id);
		if (cached !== undefined) return cached;
		try {
			const price = await stripe.prices.retrieve(id);
			const value: CyclePrice =
				price.unit_amount != null
					? { amount: price.unit_amount, currency: price.currency }
					: null;
			cache.set(id, value);
			return value;
		} catch {
			cache.set(id, null);
			return null;
		}
	}

	return Promise.all(
		PLANS.map(async (plan) => ({
			planId: plan.id,
			displayName: plan.displayName,
			free: plan.free,
			monthly: plan.free ? null : await priceFor(plan.id, "monthly"),
			annual: plan.free ? null : await priceFor(plan.id, "annual"),
			limits: plan.limits,
		})),
	);
}
