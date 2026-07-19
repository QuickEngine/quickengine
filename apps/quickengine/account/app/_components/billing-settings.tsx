"use client";

import { useEffect, useState } from "react";
import { getCurrentPlanSummary } from "../_lib/billing-actions";

// Billing tab in Settings: shows the active org's real current plan and sends users to
// the full Plans page for the upgrade/checkout flow (the source of truth for pricing).
export function BillingSettings() {
	const [planName, setPlanName] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		getCurrentPlanSummary()
			.then((summary) => {
				if (active) setPlanName(summary?.displayName ?? "Free");
			})
			.catch(() => {
				if (active) setPlanName("Free");
			});
		return () => {
			active = false;
		};
	}, []);

	return (
		<div className="flex max-w-md flex-col gap-6">
			<section>
				<h3 className="font-medium text-foreground text-sm">Current plan</h3>
				<div className="mt-2 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-4">
					<div className="flex items-center justify-between">
						<span className="font-medium text-foreground">
							{planName ?? "…"}
						</span>
						<span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] text-foreground">
							Active
						</span>
					</div>
				</div>
			</section>

			<a
				href="/billing/plans"
				className="w-fit rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90"
			>
				View plans &amp; upgrade
			</a>
			<p className="text-muted-foreground text-xs">
				Checkout is handled securely by Stripe. Invoices and payment-method
				management arrive with the customer portal.
			</p>
		</div>
	);
}
