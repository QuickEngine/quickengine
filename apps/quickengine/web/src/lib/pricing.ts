import { MODULES } from "@/lib/modules";

/**
 * The commercial model, in one place.
 *
 * 🔴 SOURCED FROM `internal/planning/PRICING_DESIGN.md` (the model) AND
 * `packages/billing/src/plans.ts` (the limits that are actually enforced). Where
 * the two disagreed, THE ENFORCED CODE WINS — a page that promises more than the
 * metering engine allows is the exact failure this rebuild exists to fix.
 *
 * The recorded disagreement, for whoever settles it:
 *   workspaces — design doc says Free 1 / Launch 1 / Grow 3 / Scale 10
 *                plans.ts says   Free 1 / Launch 3 / Grow 10 / Scale 25
 *   These numbers follow plans.ts.
 *
 * ⚠️ PRICES ARE NOT IN THE CODEBASE. `plans.ts` holds Stripe price ENV KEYS, not
 * amounts, so the figures below are transcribed from the design document and are
 * the one thing here that cannot be verified against anything that runs. Confirm
 * against Stripe before this page is public.
 */

// ⚠️ No "api" audience. See the note in `components/pricing.tsx`: the API is
// not a separate product, and usage belongs in the account app.
export type Audience = "individual" | "teams";
export type Cycle = "monthly" | "annual";

export type Tier = {
	id: "free" | "launch" | "grow" | "scale" | "expand" | "custom";
	name: string;
	/** Monthly price in whole dollars. `null` means "talk to us". */
	monthly: number | null;
	/** Annual price in whole dollars, billed yearly. */
	annual: number | null;
	/** Billed per seat rather than flat. */
	perSeat?: boolean;
	minSeats?: number;
	/**
	 * Price of a seat beyond the included allowance, in whole dollars.
	 *
	 * 🔴 This is what removes the Expand cliff. Scale includes 20 seats at $240;
	 * without purchasable seats, the 21st person forced a jump to per-seat
	 * billing that cost more than the plan. Priced in `PRICING_DESIGN.md` and
	 * never implemented — see `PRICING_BACKEND.md` for the work.
	 */
	extraSeat?: number;
	tagline: string;
	audience: Audience[];
	/** Enforced limits, from `plans.ts`. `null` means no ceiling on this plan. */
	limits: {
		workspaces: number | null;
		seats: number | null;
		storageGb: number | null;
		apiRequests: number | null;
		aiActions: number | null;
	};
};

/**
 * ⚠️ Annual is exactly two months free on every paid tier (16.7%), which is the
 * rule the design document sets so the discount is one legible line rather than
 * a percentage nobody can verify in their head.
 */
/**
 * 🔴 REVISED 2026-08-11 from `internal/planning/PRICING_STRATEGY.md`. These match
 * `packages/billing/src/plans.ts` exactly, which is the point: the page and the
 * metering engine must never be able to disagree.
 */
export const TIERS: Tier[] = [
	{
		id: "free",
		name: "Free",
		monthly: 0,
		annual: 0,
		tagline: "A genuinely working business, not a trial.",
		audience: ["individual"],
		limits: {
			workspaces: 1,
			seats: 1,
			storageGb: 2,
			apiRequests: 50_000,
			aiActions: 25,
		},
	},
	{
		id: "launch",
		extraSeat: 15,
		name: "Launch",
		monthly: 30,
		annual: 300,
		tagline: "You have customers and you are getting paid.",
		audience: ["individual"],
		limits: {
			workspaces: 2,
			seats: 3,
			storageGb: 25,
			apiRequests: 250_000,
			aiActions: 500,
		},
	},
	{
		id: "grow",
		extraSeat: 14,
		name: "Grow",
		monthly: 90,
		annual: 900,
		tagline: "Every module built, and room to run.",
		audience: ["individual"],
		limits: {
			workspaces: 5,
			seats: 8,
			storageGb: 150,
			apiRequests: 1_000_000,
			aiActions: 2_500,
		},
	},
	{
		id: "scale",
		extraSeat: 12,
		name: "Scale",
		monthly: 240,
		annual: 2_400,
		tagline: "Volume, and everything new as it ships.",
		audience: ["individual"],
		limits: {
			workspaces: 15,
			seats: 20,
			storageGb: 500,
			apiRequests: 5_000_000,
			aiActions: 10_000,
		},
	},
	{
		id: "expand",
		name: "Expand",
		monthly: 25,
		annual: 250,
		perSeat: true,
		// Twelve, not sixteen. At sixteen the first Expand bill was $400 against
		// Scale's $240, so hiring one more person cost $160/month and every
		// customer would rationally stop at fifteen and share a login — which also
		// destroys the audit trail we sell on the security page.
		minSeats: 12,
		tagline: "A team past fifteen people, billed per seat.",
		audience: ["teams"],
		// ⚠️ `null` here means "not a ceiling", NOT "unlimited and free". Every
		// seat is billed. It is the opposite meaning to the same value on the flat
		// tiers, which is exactly the confusion the old table fell into.
		limits: {
			workspaces: null,
			seats: null,
			storageGb: null,
			apiRequests: null,
			aiActions: null,
		},
	},
	{
		id: "custom",
		name: "Custom",
		monthly: null,
		annual: null,
		tagline: "A conversation, not a checkout.",
		audience: ["teams"],
		limits: {
			workspaces: null,
			seats: null,
			storageGb: null,
			apiRequests: null,
			aiActions: null,
		},
	},
];

/**
 * 🔴 "Custom", NOT "Enterprise", and the design document is emphatic about why:
 * Enterprise promises SSO, SAML, SCIM, SOC 2 and a contractual SLA. **None of
 * those exist.** Naming the tier Enterprise writes a cheque the product cannot
 * cash and the first procurement call exposes it. Rename it when the capability
 * lands, and the rename becomes an announcement rather than an embarrassment.
 */
export const TIER_ORDER: Record<Tier["id"], number> = {
	free: 0,
	launch: 1,
	grow: 2,
	scale: 3,
	expand: 4,
	custom: 5,
};

/** Which tier first includes a module. */
export function includedFrom(tier: Tier["id"]): typeof MODULES {
	return MODULES.filter(
		(module) => TIER_ORDER[module.tier] <= TIER_ORDER[tier],
	);
}

export function formatLimit(value: number | null, unit?: string): string {
	// ⚠️ Never the word "unlimited" on a flat tier. Every one of these has a real
	// ceiling in `plans.ts`, and the old table claiming otherwise is the reason
	// this page was rebuilt.
	if (value === null) return "Custom";
	if (value >= 1_000_000) return `${value / 1_000_000}M${unit ?? ""}`;
	if (value >= 1_000) return `${value / 1_000}k${unit ?? ""}`;
	return `${value}${unit ?? ""}`;
}
