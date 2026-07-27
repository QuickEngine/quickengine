import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { accountQueries, useActiveOrganization } from "../lib/account-api";

function UsagePage() {
	const { active } = useActiveOrganization();
	const plan = useQuery(accountQueries.plan(active?.id ?? ""));
	if (plan.isPending) return <main className="p-6">Loading usage…</main>;
	if (plan.isError) throw plan.error;
	return (
		<main className="space-y-6 p-6">
			<div>
				<h1 className="font-semibold text-2xl">Usage</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					{active?.name} · {plan.data.planId}
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				{Object.entries(plan.data.usage).map(([meter, usage]) => (
					<div
						key={meter}
						className="rounded-xl border border-foreground/10 p-5"
					>
						<p className="font-medium">{meter}</p>
						<p className="mt-1 text-muted-foreground text-sm">
							{usage.state ?? "available"}
						</p>
					</div>
				))}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/usage")({
	component: UsagePage,
});
