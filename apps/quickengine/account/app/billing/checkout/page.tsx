import { getSession } from "@quickengine/auth/server";
import { getPlan, getPlanPricing } from "@quickengine/billing";
import type {
	QuickEngineBillingCycle,
	QuickEnginePlanId,
} from "@quickengine/db/schema/quickengine";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveActiveOrg } from "../../_lib/active-org";

export const metadata: Metadata = { title: "Checkout" };

function money(amount: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
		minimumFractionDigits: 0,
	}).format(amount / 100);
}

// Dedicated checkout page — our own layout with Stripe's Payment Element (card fields only)
// inside. Plan + cycle come from the plans page as query params.
export default async function Page({
	searchParams,
}: {
	searchParams: Promise<{ plan?: string; cycle?: string }>;
}) {
	const session = await getSession(await headers());
	if (!session) return null;
	const org = await resolveActiveOrg(session.user.id);
	if (!org) return null;

	const { plan, cycle } = await searchParams;
	const planDef = plan ? getPlan(plan as QuickEnginePlanId) : undefined;
	if (!planDef || planDef.free) notFound();

	const billingCycle: QuickEngineBillingCycle =
		cycle === "annual" ? "annual" : "monthly";

	const pricing = await getPlanPricing();
	const planPricing = pricing.find((p) => p.planId === planDef.id);
	const price =
		billingCycle === "annual" ? planPricing?.annual : planPricing?.monthly;

	const { CheckoutForm } = await import("./checkout-form");

	return (
		<div className="mx-auto max-w-lg">
			<Link
				href="/billing/plans"
				className="text-muted-foreground text-sm transition-colors hover:text-foreground"
			>
				← Back to plans
			</Link>

			<h1 className="mt-3 font-semibold text-2xl text-foreground">
				Upgrade to {planDef.displayName}
			</h1>
			<p className="mt-1 text-muted-foreground text-sm">
				{price ? `${money(price.amount, price.currency)} ` : ""}
				billed {billingCycle === "annual" ? "yearly" : "monthly"} to{" "}
				<span className="text-foreground">{org.name}</span>.
			</p>

			<div className="mt-6 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-5">
				<CheckoutForm planId={planDef.id} cycle={billingCycle} />
			</div>

			<p className="mt-4 text-center text-[11px] text-muted-foreground">
				🔒 Payments secured by Stripe
			</p>
		</div>
	);
}
