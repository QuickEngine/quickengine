import { Check } from "@phosphor-icons/react";
import type { CyclePrice, PlanPricing } from "@quickengine/billing";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";

const searchSchema = z.object({ checkout: z.string().optional() });
type Cycle = "monthly" | "annual";

function money(price: CyclePrice): string {
	if (!price) return "—";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: price.currency.toUpperCase(),
		minimumFractionDigits: 0,
	}).format(price.amount / 100);
}
const count = (value: number | null) =>
	value === null ? "Unlimited" : value.toLocaleString();
function storage(value: number | null): string {
	if (value === null) return "Unlimited";
	const gb = value / 1024 ** 3;
	return gb >= 1
		? `${gb.toLocaleString()} GB`
		: `${Math.round(value / 1024 ** 2)} MB`;
}

function PlansPage() {
	const { checkout } = Route.useSearch();
	const { active } = useActiveOrganization();
	const navigate = useNavigate();
	const [cycle, setCycle] = useState<Cycle>("monthly");
	const [busyPlan, setBusyPlan] = useState<string | null>(null);
	const plans = useQuery({
		queryKey: ["account", active?.id, "billing", "pricing"],
		queryFn: async () =>
			(
				await api.request<{
					pricing: PlanPricing[];
					currentPlanId: string;
				}>(`/account/billing/pricing?organizationId=${active?.id}`)
			).data,
		enabled: Boolean(active?.id),
	});
	if (plans.isPending) return <main className="p-6">Loading plans…</main>;
	if (plans.isError) throw plans.error;

	return (
		<main className="space-y-6 p-6">
			<div>
				<h1 className="font-semibold text-2xl">Choose your plan</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Billing for <span className="text-foreground">{active?.name}</span>.
					Prices are live from Stripe.
				</p>
			</div>
			{checkout === "canceled" && (
				<p className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-4 py-3 text-muted-foreground text-sm">
					Checkout was canceled — you haven't been charged.
				</p>
			)}
			<div className="inline-flex rounded-lg border border-foreground/10 p-0.5">
				{(["monthly", "annual"] as const).map((value) => (
					<button
						key={value}
						type="button"
						onClick={() => setCycle(value)}
						className={`rounded-md px-3 py-1 font-medium text-xs ${
							cycle === value
								? "bg-foreground text-background"
								: "text-muted-foreground"
						}`}
					>
						{value === "monthly" ? "Monthly" : "Yearly"}
					</button>
				))}
			</div>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{plans.data.pricing.map((plan) => {
					const current = plan.planId === plans.data.currentPlanId;
					const price = cycle === "monthly" ? plan.monthly : plan.annual;
					return (
						<section
							key={plan.planId}
							className={`flex flex-col rounded-xl border p-5 ${
								current
									? "border-foreground/30 bg-foreground/[0.03]"
									: "border-foreground/[0.06] bg-foreground/[0.02]"
							}`}
						>
							<div className="flex items-center justify-between">
								<h2 className="font-medium">{plan.displayName}</h2>
								{current && (
									<span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px]">
										Current
									</span>
								)}
							</div>
							<div className="mt-3 flex items-baseline gap-1">
								<span className="font-display text-2xl">
									{plan.free ? "Free" : money(price)}
								</span>
								{!plan.free && price && (
									<span className="text-muted-foreground text-sm">
										/{cycle === "monthly" ? "mo" : "yr"}
									</span>
								)}
							</div>
							<ul className="mt-4 flex-1 space-y-1.5 text-muted-foreground text-sm">
								{[
									`${count(plan.limits.apiRequests)} API requests / period`,
									`${count(plan.limits.aiActions)} AI actions / period`,
									`${storage(plan.limits.storageBytes)} storage`,
									`${count(plan.limits.seats)} seats`,
									`${count(plan.limits.workspaces)} workspaces`,
								].map((label) => (
									<li key={label} className="flex items-center gap-2">
										<Check className="size-3.5 text-foreground" />
										{label}
									</li>
								))}
							</ul>
							<div className="mt-5">
								{current ? (
									<button
										type="button"
										disabled
										className="w-full rounded-lg border px-4 py-2 text-sm"
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
										disabled={!price || busyPlan !== null}
										onClick={async () => {
											if (!["launch", "grow", "scale"].includes(plan.planId))
												return;
											setBusyPlan(plan.planId);
											await navigate({
												to: "/billing/checkout",
												search: {
													plan: plan.planId as "launch" | "grow" | "scale",
													cycle,
												},
											});
										}}
										className="w-full rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm disabled:opacity-50"
									>
										{busyPlan === plan.planId
											? "Opening checkout…"
											: price
												? `Choose ${plan.displayName}`
												: "Unavailable"}
									</button>
								)}
							</div>
						</section>
					);
				})}
			</div>
			<p className="text-muted-foreground text-xs">
				Secure checkout is handled by Stripe. You can change or cancel anytime.
			</p>
		</main>
	);
}

export const Route = createFileRoute("/billing/plans")({
	validateSearch: searchSchema,
	component: PlansPage,
});
