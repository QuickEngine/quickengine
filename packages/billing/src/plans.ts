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

// Per-plan usage limits. Metered PER ACCOUNT (one budget shared across all the
// account's workspaces). `actions` is a COUNTER (an allowance that refills each
// billing period); the rest are GAUGES (a current-total cap that never resets).
// `null` = unlimited. ⚠️ These numbers are PLACEHOLDERS, like prices — tune here.
export type PlanLimits = {
	/** Counter: included actions per billing period. */
	actions: number | null;
	/** Gauge: total bytes stored across the account. */
	storageBytes: number | null;
	/** Gauge: team members. */
	seats: number | null;
	/** Gauge: number of workspaces. */
	workspaces: number | null;
};

export type PlanDefinition = {
	id: QuickEnginePlanId;
	/** Display label — a placeholder, safe to rename. */
	displayName: string;
	/** True for the default no-cost tier (no Stripe price). */
	free: boolean;
	/** Env var names holding the Stripe price IDs, by billing cycle. */
	priceEnv: Partial<Record<QuickEngineBillingCycle, string>>;
	/** Usage caps for this tier (placeholders — tune freely). */
	limits: PlanLimits;
};

const GB = 1024 ** 3;

const priceEnvKey = (plan: string, cycle: QuickEngineBillingCycle): string =>
	`STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`;

const paidPlan = (
	id: QuickEnginePlanId,
	displayName: string,
	limits: PlanLimits,
): PlanDefinition => ({
	id,
	displayName,
	free: false,
	priceEnv: {
		monthly: priceEnvKey(id, "monthly"),
		annual: priceEnvKey(id, "annual"),
	},
	limits,
});

export const PLANS: readonly PlanDefinition[] = [
	{
		id: "free",
		displayName: "Free",
		free: true,
		priceEnv: {},
		limits: { actions: 1_000, storageBytes: 1 * GB, seats: 1, workspaces: 1 },
	},
	paidPlan("starter", "Starter", {
		actions: 10_000,
		storageBytes: 10 * GB,
		seats: 3,
		workspaces: 3,
	}),
	paidPlan("pro", "Pro", {
		actions: 100_000,
		storageBytes: 100 * GB,
		seats: 10,
		workspaces: 10,
	}),
	paidPlan("growth", "Growth", {
		actions: 1_000_000,
		storageBytes: 500 * GB,
		seats: 25,
		workspaces: 25,
	}),
	paidPlan("team", "Team", {
		actions: 5_000_000,
		storageBytes: 2048 * GB,
		seats: 100,
		workspaces: null,
	}),
	// Enterprise is a custom conversation, not self-serve checkout.
] as const;

/** The four meters the engine tracks. */
export type MeterKey = keyof PlanLimits;

/** Which meters refill each period (counters) vs. are a current total (gauges). */
export const METER_KIND: Record<MeterKey, "counter" | "gauge"> = {
	actions: "counter",
	storageBytes: "gauge",
	seats: "gauge",
	workspaces: "gauge",
};

export const getPlan = (id: QuickEnginePlanId): PlanDefinition | undefined =>
	PLANS.find((plan) => plan.id === id);

/** A plan's usage limits, falling back to Free for an unknown id. */
export const getPlanLimits = (id: QuickEnginePlanId): PlanLimits =>
	(PLANS.find((plan) => plan.id === id) ?? PLANS[0]).limits;

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
