// Placeholder pricing — the real numbers are Asher + Reese's call (Business Model
// doc: "prices TBD"). The only firm rule baked in: annual is always monthly × 12,
// discounted 10–15%. These values are safe to swap later; they feed Stripe price
// IDs when billing goes live.
export const ANNUAL_DISCOUNT = 0.15;

export type Plan = {
	id: "free" | "launch" | "grow" | "scale";
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
		id: "launch",
		name: "Launch",
		monthly: 9,
		features: [
			"3 workspaces",
			"Scheduling + inventory",
			"10 GB storage",
			"2 seats",
		],
	},
	{
		id: "grow",
		name: "Grow",
		monthly: 19,
		highlight: true,
		features: [
			"10 workspaces",
			"Reporting + automation",
			"100 GB storage",
			"5 seats",
		],
	},
	{
		id: "scale",
		name: "Scale",
		monthly: 39,
		features: [
			"Unlimited workspaces",
			"Everything in Grow",
			"1 TB storage",
			"15 seats",
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
