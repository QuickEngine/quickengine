import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { getSession } from "@quickengine/auth/server";
import {
	getAccountPlanId,
	getPlan,
	getStripe,
	upsertSubscriptionFromStripe,
} from "@quickengine/billing";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { resolveActiveOrg } from "../../_lib/active-org";

export const metadata: Metadata = { title: "Upgrade complete" };

// Payment Element returns here after confirmPayment. We retrieve the subscription and record
// it directly (idempotent — same upsert the webhook runs), so the new plan is live at once in
// local dev without the Stripe CLI. In production the webhook is the source of truth.
export default async function Page({
	searchParams,
}: {
	searchParams: Promise<{ subscription_id?: string }>;
}) {
	const session = await getSession(await headers());
	if (!session) return null;
	const org = await resolveActiveOrg(session.user.id);
	if (!org) return null;

	const { subscription_id } = await searchParams;
	let confirmed = false;

	if (subscription_id) {
		try {
			const sub = await getStripe().subscriptions.retrieve(subscription_id);
			await upsertSubscriptionFromStripe(sub);
			confirmed = true;
		} catch {
			// Fall through — the webhook will reconcile; we just can't confirm instantly.
		}
	}

	const planId = await getAccountPlanId(org.id);
	const planName = getPlan(planId)?.displayName ?? "your new plan";

	return (
		<div className="mx-auto max-w-md py-16 text-center">
			<CheckCircle className="mx-auto size-12 text-emerald-400" weight="fill" />
			<h1 className="mt-4 font-semibold text-2xl text-foreground">
				You're on {planName}
			</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				{confirmed
					? `Thanks — ${org.name} is now on the ${planName} plan.`
					: "Your payment went through. Your plan will update in a moment if it hasn't already."}
			</p>
			<div className="mt-8 flex justify-center gap-3">
				<Link
					href="/"
					className="rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm transition-opacity hover:opacity-90"
				>
					Back to dashboard
				</Link>
				<Link
					href="/billing/plans"
					className="rounded-lg border border-foreground/15 px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-foreground/5"
				>
					View plans
				</Link>
			</div>
		</div>
	);
}
