import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "@quickengine/auth/server";
import { getAccountPlanId, getPlanPricing } from "@quickengine/billing";
import { headers } from "next/headers";
import { resolveActiveOrg } from "@/lib/active-org";


// Dedicated plans page: every tier with its live Stripe price, the active org's current plan
// highlighted, a checkout button per tier. Org-scoped — the active org is billed.
async function Page({
	searchParams,
}: {
	searchParams: Promise<{ checkout?: string }>;
}) {
	const session = await getSession(await headers());
	if (!session) return null;
	const org = await resolveActiveOrg(session.user.id);
	if (!org) return null;

	const { checkout } = await searchParams;
	const [pricing, currentPlanId] = await Promise.all([
		getPlanPricing(),
		getAccountPlanId(org.id),
	]);

	const { PlansView } = await import("./plans-view");

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-semibold text-2xl text-foreground">
					Choose your plan
				</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Billing for <span className="text-foreground">{org.name}</span>.
					Prices are live from Stripe.
				</p>
			</div>
			<PlansView
				pricing={pricing}
				currentPlanId={currentPlanId}
				canceled={checkout === "canceled"}
			/>
		</div>
	);
}

export const Route = createFileRoute("/billing/plans")({
	component: Page,
});
