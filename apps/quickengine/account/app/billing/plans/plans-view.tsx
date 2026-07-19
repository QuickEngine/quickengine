"use client";

import { Check } from "@phosphor-icons/react";
import type { CyclePrice, PlanPricing } from "@quickengine/billing";
import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

function money(price: CyclePrice): string {
	if (!price) return "—";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: price.currency.toUpperCase(),
		minimumFractionDigits: 0,
	}).format(price.amount / 100);
}

function count(n: number | null): string {
	return n === null ? "Unlimited" : n.toLocaleString();
}

function storage(n: number | null): string {
	if (n === null) return "Unlimited";
	const gb = n / 1024 ** 3;
	return gb >= 1
		? `${gb.toLocaleString()} GB`
		: `${Math.round(n / 1024 ** 2)} MB`;
}

export function PlansView({
	pricing,
	currentPlanId,
	canceled,
}: {
	pricing: PlanPricing[];
	currentPlanId: string;
	canceled: boolean;
}) {
	const router = useRouter();
	const [cycle, setCycle] = useState<QuickEngineBillingCycle>("monthly");
	const [pending, startTransition] = useTransition();
	const [busyPlan, setBusyPlan] = useState<string | null>(null);

	// Go to our own checkout page (Payment Element there), carrying plan + cycle.
	function choose(planId: QuickEnginePlanId) {
		setBusyPlan(planId);
		startTransition(() => {
			router.push(`/billing/checkout?plan=${planId}&cycle=${cycle}`);
		});
	}

	return (
		<div className="space-y-6">
			{canceled && (
				<p className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-4 py-3 text-muted-foreground text-sm">
					Checkout was canceled — you haven't been charged.
				</p>
			)}

			<div className="inline-flex rounded-lg border border-foreground/10 p-0.5">
				{(["monthly", "annual"] as const).map((c) => (
					<button
						key={c}
						type="button"
						onClick={() => setCycle(c)}
						className={`rounded-md px-3 py-1 font-medium text-xs transition-colors ${
							cycle === c
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{c === "monthly" ? "Monthly" : "Yearly"}
					</button>
				))}
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{pricing.map((plan) => {
					const isCurrent = plan.planId === currentPlanId;
					const price = cycle === "monthly" ? plan.monthly : plan.annual;
					return (
						<div
							key={plan.planId}
							className={`flex flex-col rounded-xl border p-5 ${
								isCurrent
									? "border-foreground/30 bg-foreground/[0.03]"
									: "border-foreground/[0.06] bg-foreground/[0.02]"
							}`}
						>
							<div className="flex items-center justify-between gap-2">
								<h3 className="font-medium text-foreground">
									{plan.displayName}
								</h3>
								{isCurrent && (
									<span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] text-foreground">
										Current
									</span>
								)}
							</div>

							<div className="mt-3 flex items-baseline gap-1">
								<span className="font-display text-2xl text-foreground">
									{plan.free ? "Free" : money(price)}
								</span>
								{!plan.free && price && (
									<span className="text-muted-foreground text-sm">
										/{cycle === "monthly" ? "mo" : "yr"}
									</span>
								)}
							</div>

							<ul className="mt-4 flex-1 space-y-1.5 text-muted-foreground text-sm">
								<li className="flex items-center gap-2">
									<Check className="size-3.5 shrink-0 text-foreground" />
									{count(plan.limits.actions)} actions / period
								</li>
								<li className="flex items-center gap-2">
									<Check className="size-3.5 shrink-0 text-foreground" />
									{storage(plan.limits.storageBytes)} storage
								</li>
								<li className="flex items-center gap-2">
									<Check className="size-3.5 shrink-0 text-foreground" />
									{count(plan.limits.seats)} seats
								</li>
								<li className="flex items-center gap-2">
									<Check className="size-3.5 shrink-0 text-foreground" />
									{count(plan.limits.workspaces)} workspaces
								</li>
							</ul>

							<div className="mt-5">
								{isCurrent ? (
									<button
										type="button"
										disabled
										className="w-full rounded-lg border border-foreground/10 px-4 py-2 font-medium text-muted-foreground text-sm"
									>
										Current plan
									</button>
								) : plan.free ? (
									<span className="block text-center text-muted-foreground text-xs">
										Downgrade from the customer portal
									</span>
								) : (
									<button
										type="button"
										disabled={pending || !price}
										onClick={() => choose(plan.planId as QuickEnginePlanId)}
										className="w-full rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
									>
										{busyPlan === plan.planId
											? "Opening checkout…"
											: price
												? `Choose ${plan.displayName}`
												: "Unavailable"}
									</button>
								)}
							</div>
						</div>
					);
				})}
			</div>

			<p className="text-muted-foreground text-xs">
				Secure checkout is handled by Stripe. You can change or cancel anytime.
			</p>
		</div>
	);
}
