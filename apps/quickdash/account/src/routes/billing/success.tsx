import { CheckCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";
import { PLANS } from "../../lib/plans";

/**
 * `/billing/success` — where Stripe sends somebody the instant their card clears.
 *
 * 🔴 Restored 2026-09-06. This was an empty `<main>`, and it is the RETURN URL
 * the checkout hands to Stripe. So the sequence was: enter a card, pay $129, get
 * redirected to a blank screen. No confirmation, no plan name, no way to tell
 * whether it had worked. That is the single worst moment in the product to show
 * nothing, because the customer's next thought is "did that go through, and have
 * I been charged twice?"
 *
 * ⚠️ The confirm call is best effort. Stripe's webhook is what actually settles
 * the subscription, so this page must read as success even if the call fails —
 * their money is taken and their plan is changing regardless. It exists to move
 * the plan forward IMMEDIATELY rather than waiting on webhook delivery, so the
 * console does not still say "Free" thirty seconds after somebody paid.
 */
function SuccessPage() {
	const search = Route.useSearch();
	const { active } = useActiveOrganization();
	const queryClient = useQueryClient();
	const plan = useQuery(accountQueries.plan(active?.id ?? ""));

	const confirm = useMutation({
		mutationFn: (subscriptionId: string) =>
			api.request("/account/subscription/confirm", {
				method: "POST",
				body: { subscriptionId },
			}),
		// `onSettled`, not `onSuccess`: refetch the plan either way, because the
		// webhook may have already done the work this call was trying to do.
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: ["account", active?.id, "plan"],
			}),
	});

	useEffect(() => {
		if (search.subscription_id && confirm.isIdle) {
			confirm.mutate(search.subscription_id);
		}
	}, [confirm, search.subscription_id]);

	const planName =
		PLANS.find((candidate) => candidate.id === plan.data?.planId)?.name ??
		"your new plan";

	return (
		<main className="mx-auto max-w-md py-16 text-center">
			<CheckCircle className="mx-auto size-12 text-emerald-400" weight="fill" />
			<h1 className="mt-4 font-semibold text-2xl">You're on {planName}</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				{confirm.isSuccess
					? `Thanks — ${active?.name ?? "your organization"} is now on ${planName}.`
					: "Your payment went through. Your plan will update in a moment if it hasn't already."}
			</p>
			<p className="mt-3 text-muted-foreground text-xs">
				A receipt is on its way to your billing email.
			</p>
			<div className="mt-8 flex justify-center gap-3">
				<Link
					to="/"
					className="rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm"
				>
					Back to your account
				</Link>
				<Link
					to="/billing"
					className="rounded-lg border border-foreground/15 px-4 py-2 font-medium text-sm"
				>
					Billing
				</Link>
			</div>
		</main>
	);
}

export const Route = createFileRoute("/billing/success")({
	validateSearch: z.object({ subscription_id: z.string().optional() }),
	component: SuccessPage,
});
