"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

// Billing cycle lives in the URL (?billing=annual|monthly) so it's shareable and
// refresh-proof, and the tier cards we add later read the same state. Annual is
// the default — we lead with it and let users switch to monthly.
export const CYCLES = ["annual", "monthly"] as const;
export type Cycle = (typeof CYCLES)[number];

export function useBillingCycle() {
	return useQueryState(
		"billing",
		parseAsStringLiteral(CYCLES).withDefault("annual"),
	);
}

export function PricingHero() {
	const [cycle, setCycle] = useBillingCycle();

	return (
		<section className="page-gutter flex flex-col items-center pt-28 pb-16 text-center">
			<h1 className="max-w-3xl font-display font-normal text-5xl text-foreground leading-[1.05] tracking-tight sm:text-6xl">
				Pricing that scales with your business.
			</h1>
			<p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
				Start free, upgrade when you outgrow it. Every tier is one backend with
				all modules — you pay for scale, not features.
			</p>

			{/* Annual / monthly toggle */}
			<div className="mt-10 flex flex-col items-center gap-3">
				<div className="inline-flex items-center rounded-full border border-border p-1">
					{CYCLES.map((c) => (
						<button
							key={c}
							type="button"
							onClick={() => setCycle(c)}
							aria-pressed={cycle === c}
							className={`h-9 rounded-full px-5 font-normal text-sm transition-colors ${
								cycle === c
									? "bg-foreground text-background"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{c === "annual" ? "Annual" : "Monthly"}
						</button>
					))}
				</div>
				<p className="text-muted-foreground text-xs">
					Save 20% with annual billing
				</p>
			</div>
		</section>
	);
}
