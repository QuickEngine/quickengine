import { Button } from "@quickengine/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { accountQueries, useActiveOrganization } from "../../lib/account-api";

function SuccessPage() {
	const { active } = useActiveOrganization();
	const plan = useQuery(accountQueries.plan(active?.id ?? ""));
	return (
		<main className="mx-auto max-w-xl space-y-5 p-6 text-center">
			<h1 className="font-semibold text-3xl">Payment received</h1>
			<p className="text-muted-foreground">
				Your current plan is {plan.data?.planId ?? "being confirmed"}.
			</p>
			<Button asChild>
				<Link to="/">Return to workspaces</Link>
			</Button>
		</main>
	);
}

export const Route = createFileRoute("/billing/success")({
	validateSearch: z.object({ subscription_id: z.string().optional() }),
	component: SuccessPage,
});
