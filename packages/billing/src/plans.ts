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
	/**
	 * Counter: included API requests per billing period.
	 *
	 * Separate from `aiActions` because they are different costs to us. A request
	 * consumes our own infrastructure — a function invocation, database compute, a
	 * connection — at roughly $0.0001. An AI action buys tokens from Anthropic at
	 * roughly $0.003, some thirty times more. One shared allowance could be spent
	 * either way, so the same number on a pricing page would mean wildly different
	 * cost to us and could not be priced honestly.
	 */
	apiRequests: number | null;
	/**
	 * Counter: included AI operations per billing period.
	 *
	 * An AI-triggered request increments **both** meters, and that is correct
	 * rather than double-billing: it genuinely consumes our infrastructure *and*
	 * a third party's, the same way a file upload consumes a request and storage.
	 */
	aiActions: number | null;
	/** Gauge: total bytes stored across the account. */
	storageBytes: number | null;
	/** Gauge: team members. */
	seats: number | null;
	/** Gauge: number of workspaces. */
	workspaces: number | null;
	/**
	 * Counter: outbound webhook attempts, retries included.
	 *
	 * ⚠️ `null` on every tier today — **counted, not capped.** The allowance rule
	 * in `STEP_9_AUDIT.md` is that an included amount must be predictable to a
	 * customer, and nobody can predict a number nobody has measured. Real volume
	 * comes first; the limits come after.
	 */
	webhookDeliveries: number | null;
};

export type PlanDefinition = {
	id: QuickEnginePlanId;
	/** Display label — a placeholder, safe to rename. */
	displayName: string;
	/** True for the default no-cost tier (no Stripe price). */
	free: boolean;
	/** Env var names holding the Stripe price IDs, by billing cycle. */
	priceEnv: Partial<Record<QuickEngineBillingCycle, string>>;
	/**
	 * Usage caps for this tier.
	 *
	 * ⚠️ For a plan with `perSeat: true` these are the allowances **per seat**,
	 * not the account total. Always read them through `getPlanLimits`, which
	 * multiplies; reading `.limits` directly would silently apply one seat's
	 * worth to an entire company.
	 */
	limits: PlanLimits;
	/** True when `limits` are per seat and scale with the billed quantity. */
	perSeat?: boolean;
	/**
	 * Internal tier — assigned by hand, never sold.
	 *
	 * Anything that shows a customer what they can buy must read
	 * `SELLABLE_PLANS`, not `PLANS`. Filtering at each call site instead would
	 * mean every new pricing surface is one forgotten `.filter()` away from
	 * advertising a free unlimited plan.
	 */
	internal?: boolean;
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
		limits: {
			apiRequests: 10_000,
			aiActions: 25,
			storageBytes: 1 * GB,
			seats: 1,
			workspaces: 1,
			webhookDeliveries: null,
		},
	},
	paidPlan("launch", "Launch", {
		apiRequests: 250_000,
		aiActions: 500,
		storageBytes: 25 * GB,
		seats: 2,
		workspaces: 3,
		webhookDeliveries: null,
	}),
	paidPlan("grow", "Grow", {
		apiRequests: 1_000_000,
		aiActions: 2_500,
		storageBytes: 100 * GB,
		seats: 5,
		workspaces: 10,
		webhookDeliveries: null,
	}),
	paidPlan("scale", "Scale", {
		apiRequests: 5_000_000,
		aiActions: 10_000,
		storageBytes: 500 * GB,
		seats: 15,
		workspaces: 25,
		webhookDeliveries: null,
	}),
	// 🔴 Teams is the only PER-SEAT tier. Launch, Grow and Scale are flat prices
	// with a seat ceiling; Teams bills $30 x quantity, where the quantity IS the
	// member count. `seats: null` therefore means "not a ceiling" here, not
	// "unlimited and free" — every seat is charged, the opposite of what that
	// value means on every other row. Read it together with `TEAMS_MIN_SEATS`.
	{
		id: "teams",
		// Stored id stays `teams`; only the label changed. The ladder is a verb of
		// progression at every other rung — Launch, Grow, Scale — and "Teams" was a
		// noun describing who is on it, which broke the rhythm at the top.
		displayName: "Expand",
		free: false,
		priceEnv: {
			monthly: priceEnvKey("teams", "monthly"),
			annual: priceEnvKey("teams", "annual"),
		},
		perSeat: true,
		limits: {
			// PER SEAT, not per account. Calibrated so the 16-seat floor lands above
			// Scale in every dimension — 8M requests, 24k AI actions, 800 GB against
			// Scale's 5M / 10k / 500 GB — because moving up a tier must never cost a
			// customer capacity. Everything above the floor grows with the team.
			apiRequests: 500_000,
			aiActions: 1_500,
			storageBytes: 50 * GB,
			// Not a ceiling. Every seat is billed, so there is nothing to cap.
			seats: null,
			workspaces: null,
			webhookDeliveries: null,
		},
	},
	// 🔴 INTERNAL. `enterprise` is the STORED id for what the ladder calls
	// "Custom" — see the note on `QuickEnginePlanId`. Custom is a conversation,
	// not self-serve checkout, so it carries no price and never appears in a
	// pricing list.
	//
	// It needs an entry all the same. `getPlanLimits` falls back to `PLANS[0]`
	// for an unknown id, and `PLANS[0]` is Free — so without this row the first
	// real Custom customer would silently be enforced at 10,000 requests and one
	// seat. The largest account on the smallest allowance.
	//
	// Limits are unlimited because they are agreed in the contract, not in code.
	// AI stays capped for the same reason as Bypass: the Anthropic pool is
	// prepaid and shared, so no tier gets an infinite claim on it.
	{
		id: "enterprise",
		displayName: "Custom",
		free: false,
		internal: true,
		priceEnv: {},
		limits: {
			apiRequests: null,
			aiActions: 100_000,
			storageBytes: null,
			seats: null,
			workspaces: null,
			webhookDeliveries: null,
		},
	},

	// 🔴 INTERNAL. Never sold, never listed, assigned by hand — for the team,
	// for family and friends, and for testing against real limits without
	// hitting them.
	//
	// `free: true` because there is no Stripe price and no checkout path; it is
	// not a tier anyone can reach. Filter it out of any pricing UI by id.
	//
	// ⚠️ `aiActions` is CAPPED, and generously rather than infinitely, which is
	// the one number here that is not an oversight. Anthropic is PREPAID from a
	// pool shared by every customer, so the failure mode is not an unpaid bill —
	// it is the pool emptying and AI breaking for paying customers at the same
	// moment. An unmetered internal tier handed to friends and family is exactly
	// the shape of that accident. Everything that costs us only our own
	// infrastructure is genuinely unlimited.
	{
		id: "bypass",
		displayName: "Bypass",
		free: true,
		internal: true,
		priceEnv: {},
		limits: {
			apiRequests: null,
			aiActions: 25_000,
			storageBytes: null,
			seats: null,
			workspaces: null,
			webhookDeliveries: null,
		},
	},
] as const;

/**
 * The plans a customer may actually be shown or sold.
 *
 * `PLANS` is the full ladder including internal tiers, and is what enforcement
 * and lookups read — an account ON `bypass` still has to resolve its limits.
 * Anything customer-facing reads this instead.
 */
export const SELLABLE_PLANS: readonly PlanDefinition[] = PLANS.filter(
	(plan) => !plan.internal,
);

/**
 * The smallest Teams subscription that can be bought.
 *
 * 16 because Scale caps at 15, so the ladder is continuous: no headcount that
 * two tiers both serve, none that neither does.
 *
 * It is a usability guard, not a pricing control. At $30 a seat Teams is never
 * cheaper than the flat tier already serving the same headcount, so nothing
 * breaks if this is bypassed — a customer would simply be paying more than they
 * need to. An earlier $25 was rejected precisely because it made this floor
 * load-bearing. See DECISIONS.md, 2026-08-01.
 *
 * Enforced here because Stripe has no concept of a minimum quantity.
 */
export const TEAMS_MIN_SEATS = 16;

/** True when the plan bills per seat rather than at a flat rate. */
export const isPerSeatPlan = (id: QuickEnginePlanId): boolean => id === "teams";

/**
 * How many seats a per-seat subscription should be billed for.
 *
 * Never fewer than the floor, so a team that drops to 12 members keeps a valid
 * subscription rather than one Stripe would price below the tier's entry point.
 */
export const billableSeats = (memberCount: number): number =>
	Math.max(TEAMS_MIN_SEATS, memberCount);

/** The meters the engine tracks. */
export type MeterKey = keyof PlanLimits;

/** Which meters refill each period (counters) vs. are a current total (gauges). */
export const METER_KIND: Record<MeterKey, "counter" | "gauge"> = {
	apiRequests: "counter",
	aiActions: "counter",
	storageBytes: "gauge",
	seats: "gauge",
	workspaces: "gauge",
	webhookDeliveries: "counter",
};

export const getPlan = (id: QuickEnginePlanId): PlanDefinition | undefined =>
	PLANS.find((plan) => plan.id === id);

/** A plan's usage limits, falling back to Free for an unknown id. */
/**
 * The limits that apply to an account.
 *
 * 🔴 `seats` is REQUIRED for a per-seat plan and ignored for every other one.
 * Omitting it on Teams falls back to the 16-seat floor, which under-grants a
 * larger team rather than over-granting it — a throttled customer is a visible
 * bug, an unmetered one is a silent revenue hole. Enforcement resolves seats
 * through `getAccountLimits` so the fallback is never reached in practice.
 */
export const getPlanLimits = (
	id: QuickEnginePlanId,
	seats?: number,
): PlanLimits => {
	const plan = PLANS.find((entry) => entry.id === id) ?? PLANS[0];
	if (!plan.perSeat) return plan.limits;
	const quantity = billableSeats(seats ?? 0);
	const scale = (value: number | null): number | null =>
		value === null ? null : value * quantity;
	return {
		apiRequests: scale(plan.limits.apiRequests),
		aiActions: scale(plan.limits.aiActions),
		storageBytes: scale(plan.limits.storageBytes),
		webhookDeliveries: scale(plan.limits.webhookDeliveries),
		seats: plan.limits.seats,
		workspaces: plan.limits.workspaces,
	};
};

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
