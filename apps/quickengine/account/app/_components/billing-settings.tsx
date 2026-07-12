"use client";

import { Check } from "@phosphor-icons/react";
import { PLANS } from "../_lib/plans";

// Billing (concept). Everyone is on Free until Stripe checkout is wired to the
// upgrade path; real subscription state + a customer portal come with billing.
export function BillingSettings() {
	const free = PLANS.find((p) => p.id === "free");

	return (
		<div className="flex max-w-md flex-col gap-6">
			<section>
				<h3 className="font-medium text-foreground text-sm">Current plan</h3>
				<div className="mt-2 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-4">
					<div className="flex items-center justify-between">
						<span className="font-medium text-foreground">Free</span>
						<span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] text-foreground">
							Active
						</span>
					</div>
					<ul className="mt-3 space-y-1.5">
						{free?.features.map((f) => (
							<li
								key={f}
								className="flex items-center gap-2 text-muted-foreground text-sm"
							>
								<Check className="size-3.5 shrink-0 text-foreground" />
								{f}
							</li>
						))}
					</ul>
				</div>
			</section>

			<button
				type="button"
				className="w-fit rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90"
			>
				Upgrade plan
			</button>
			<p className="text-muted-foreground text-xs">
				Invoices and payment method management arrive with Stripe billing.
			</p>
		</div>
	);
}
