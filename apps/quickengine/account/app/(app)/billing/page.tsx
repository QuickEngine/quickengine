import { getSession } from "@quickengine/auth/server";
import { getSubscriptionForOrg } from "@quickengine/billing";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Panel, PanelLabel } from "../../_components/surface";
import { resolveActiveOrg } from "../../_lib/active-org";
import { PLANS, type Plan } from "../../_lib/plans";

export const metadata: Metadata = { title: "Billing" };

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

// Billing is ORG-scoped: the plan and seats bill to the active organization (a personal org
// is an individual's billing entity, a shared org is a team's). The plan is read from the
// org's subscription; the paid upgrade wires in with the checkout/metering org-scope
// migration + real Stripe products.
export default async function Page() {
	const session = await getSession(await headers());
	if (!session) return null;
	const org = await resolveActiveOrg(session.user.id);
	if (!org) return null;

	const subscription = await getSubscriptionForOrg(org.id);
	const currentPlanId =
		subscription && ACTIVE_STATUSES.has(subscription.status)
			? subscription.planId
			: "free";
	const currentPlan =
		PLANS.find((plan) => plan.id === currentPlanId) ?? PLANS[0];

	return (
		<div className="space-y-4 p-6">
			<Panel>
				<PanelLabel>Current plan</PanelLabel>
				<div className="mt-3 flex items-center justify-between gap-4">
					<div>
						<p className="font-medium text-foreground">{currentPlan.name}</p>
						<p className="mt-1 text-muted-foreground text-sm">
							Billed to {org.name}
							{org.isPersonal ? " · personal" : ""}
						</p>
					</div>
					<span className="rounded-full bg-foreground/10 px-2.5 py-0.5 text-[11px] text-foreground">
						{subscription?.status ?? "active"}
					</span>
				</div>
			</Panel>

			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{PLANS.map((plan) => (
					<PlanCard
						key={plan.id}
						plan={plan}
						current={plan.id === currentPlanId}
					/>
				))}
			</section>

			<p className="text-muted-foreground text-xs">
				Prices are placeholders until finalized in Stripe. Upgrading arrives
				with checkout wired to organizations — the plan and seats bill to{" "}
				<strong>{org.name}</strong>, not your personal account.
			</p>
		</div>
	);
}

function PlanCard({ plan, current }: { plan: Plan; current: boolean }) {
	return (
		<div
			className={`rounded-xl border p-5 ${
				current
					? "border-primary/50 bg-primary/[0.04]"
					: "border-foreground/[0.06]"
			}`}
		>
			<div className="flex items-center justify-between">
				<p className="font-medium text-foreground">{plan.name}</p>
				{current && <span className="text-primary text-xs">Current</span>}
			</div>
			<p className="mt-1 font-display text-2xl text-foreground">
				{plan.monthly === 0 ? "Free" : `$${plan.monthly}`}
				{plan.monthly > 0 && (
					<span className="text-muted-foreground text-sm"> /mo</span>
				)}
			</p>
			<ul className="mt-3 space-y-1.5">
				{plan.features.map((feature) => (
					<li key={feature} className="text-muted-foreground text-sm">
						{feature}
					</li>
				))}
			</ul>
		</div>
	);
}
