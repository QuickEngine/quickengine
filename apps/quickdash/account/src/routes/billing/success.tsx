import { CheckCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { api } from "../../lib/api";
import { PLANS } from "../../lib/plans";

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
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: ["account", active?.id, "plan"],
			}),
	});
	useEffect(() => {
		if (search.subscription_id && confirm.isIdle)
			confirm.mutate(search.subscription_id);
	}, [confirm, search.subscription_id]);
	const planName =
		PLANS.find((candidate) => candidate.id === plan.data?.planId)?.name ??
		"your new plan";
	return (
		<div className="mx-auto max-w-md py-16 text-center">
			<CheckCircle className="mx-auto size-12 text-emerald-400" weight="fill" />
			<h1 className="mt-4 font-semibold text-2xl">You're on {planName}</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				{confirm.isSuccess
					? `Thanks — ${active?.name ?? "your organization"} is now on the ${planName} plan.`
					: "Your payment went through. Your plan will update in a moment if it hasn't already."}
			</p>
			<div className="mt-8 flex justify-center gap-3">
				<Link
					to="/"
					className="rounded-lg bg-foreground px-4 py-2 font-medium text-background text-sm"
				>
					Back to dashboard
				</Link>
				<Link
					to="/billing/plans"
					className="rounded-lg border border-foreground/15 px-4 py-2 font-medium text-sm"
				>
					View plans
				</Link>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/billing/success")({
	validateSearch: z.object({ subscription_id: z.string().optional() }),
	component: SuccessPage,
});
