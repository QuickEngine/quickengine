import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for plans.
//
// ⚠️ Tier NAMES are placeholders (subject to change) and PRICES are TBD. Rename a
// tier or wire a price by editing THIS file only — nothing else hardcodes tier
// names. Amounts never live in code: each paid tier points at a Stripe price via
// an env var (STRIPE_PRICE_<PLAN>_<CYCLE>), so prices are set in Stripe and can
// change without a code change. Any of these env vars may be unset pre-launch.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanDefinition = {
	id: QuickEnginePlanId;
	/** Display label — a placeholder, safe to rename. */
	displayName: string;
	/** True for the default no-cost tier (no Stripe price). */
	free: boolean;
	/** Env var names holding the Stripe price IDs, by billing cycle. */
	priceEnv: Partial<Record<QuickEngineBillingCycle, string>>;
};

const priceEnvKey = (plan: string, cycle: QuickEngineBillingCycle): string =>
	`STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`;

const paidPlan = (
	id: QuickEnginePlanId,
	displayName: string,
): PlanDefinition => ({
	id,
	displayName,
	free: false,
	priceEnv: {
		monthly: priceEnvKey(id, "monthly"),
		annual: priceEnvKey(id, "annual"),
	},
});

export const PLANS: readonly PlanDefinition[] = [
	{ id: "free", displayName: "Free", free: true, priceEnv: {} },
	paidPlan("starter", "Starter"),
	paidPlan("pro", "Pro"),
	paidPlan("growth", "Growth"),
	paidPlan("team", "Team"),
	// Enterprise is a custom conversation, not self-serve checkout.
] as const;

export const getPlan = (id: QuickEnginePlanId): PlanDefinition | undefined =>
	PLANS.find((plan) => plan.id === id);

/** Resolve the Stripe price ID for a plan + cycle, or undefined if unset. */
export const getStripePriceId = (
	planId: QuickEnginePlanId,
	cycle: QuickEngineBillingCycle,
): string | undefined => {
	const envKey = getPlan(planId)?.priceEnv[cycle];
	return envKey ? process.env[envKey] : undefined;
};

/** Reverse-map a Stripe price ID back to our plan ID (used by the webhook). */
export const planIdForPriceId = (
	priceId: string,
): QuickEnginePlanId | undefined => {
	for (const plan of PLANS) {
		for (const envKey of Object.values(plan.priceEnv)) {
			if (envKey && process.env[envKey] === priceId) {
				return plan.id;
			}
		}
	}
	return undefined;
};
