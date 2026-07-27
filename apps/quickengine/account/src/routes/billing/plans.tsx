import { Button } from "@quickengine/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";
import { PLANS } from "../../lib/plans";

const searchSchema = z.object({ checkout: z.string().optional() });

function PlansPage() {
	const { active } = useActiveOrganization();
	const current = useQuery(accountQueries.plan(active?.id ?? ""));
	return (
		<main className="mx-auto max-w-6xl space-y-8 p-6">
			<div className="text-center">
				<h1 className="font-semibold text-3xl">Plans</h1>
				<p className="mt-2 text-muted-foreground">
					Choose the infrastructure allowance that fits your organization.
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				{PLANS.map((plan) => (
					<section
						key={plan.id}
						className="flex flex-col rounded-xl border border-foreground/10 p-5"
					>
						<h2 className="font-semibold text-xl">{plan.name}</h2>
						<p className="mt-2 text-3xl">${plan.monthly}</p>
						<ul className="my-5 flex-1 space-y-2 text-muted-foreground text-sm">
							{plan.features.map((feature) => (
								<li key={feature}>{feature}</li>
							))}
						</ul>
						{plan.id === current.data?.planId ? (
							<Button disabled>Current plan</Button>
						) : plan.id === "free" ? null : (
							<Button asChild>
								<Link
									to="/billing/checkout"
									search={{ plan: plan.id, cycle: "monthly" }}
								>
									Choose {plan.name}
								</Link>
							</Button>
						)}
					</section>
				))}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/billing/plans")({
	validateSearch: searchSchema,
	component: PlansPage,
});
