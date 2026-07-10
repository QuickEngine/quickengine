// Placeholder pricing — the real numbers are Asher + Reese's call (Business Model
// doc: "prices TBD"). The only firm rule baked in: annual is always monthly × 12,
// discounted 10–15%. These values are safe to swap later; they feed Stripe price
// IDs when billing goes live.
export const ANNUAL_DISCOUNT = 0.15;

export type Plan = {
	id: string;
	name: string;
	monthly: number; // placeholder USD / month
	highlight?: boolean;
	features: string[];
};

export const PLANS: Plan[] = [
	{
		id: "free",
		name: "Free",
		monthly: 0,
		features: ["1 workspace", "Core modules", "1 GB storage", "1 seat"],
	},
	{
		id: "starter",
		name: "Starter",
		monthly: 9,
		features: [
			"3 workspaces",
			"Scheduling + inventory",
			"10 GB storage",
			"3 seats",
		],
	},
	{
		id: "pro",
		name: "Pro",
		monthly: 19,
		highlight: true,
		features: [
			"10 workspaces",
			"Reporting + automation",
			"100 GB storage",
			"10 seats",
		],
	},
	{
		id: "growth",
		name: "Growth",
		monthly: 39,
		features: [
			"Unlimited workspaces",
			"Everything in Pro",
			"1 TB storage",
			"25 seats",
		],
	},
];

// Per-month price for the chosen billing cadence. Annual applies the discount.
export function monthlyPrice(plan: Plan, annual: boolean): number {
	if (plan.monthly === 0) {
		return 0;
	}
	return annual
		? Math.round(plan.monthly * (1 - ANNUAL_DISCOUNT))
		: plan.monthly;
}
