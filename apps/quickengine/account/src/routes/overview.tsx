import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { accountQueries, useActiveOrganization } from "../lib/account-api";

function OverviewPage() {
	const { active } = useActiveOrganization();
	const workspaces = useQuery(accountQueries.workspaces(active?.id ?? ""));
	const members = useQuery(accountQueries.members(active?.id ?? ""));
	if (workspaces.isPending || members.isPending) {
		return <main className="p-6">Loading overview…</main>;
	}
	if (workspaces.isError || members.isError) {
		throw workspaces.error ?? members.error;
	}
	const activeWorkspaces = workspaces.data.items.filter(
		(workspace) => !workspace.archivedAt,
	);
	return (
		<main className="space-y-6 p-6">
			<div>
				<h1 className="font-semibold text-2xl">Overview</h1>
				<p className="mt-1 text-muted-foreground text-sm">{active?.name}</p>
			</div>
			<div className="grid gap-4 md:grid-cols-3">
				<Metric label="Active workspaces" value={activeWorkspaces.length} />
				<Metric label="Team members" value={members.data.items.length} />
				<Metric
					label="Archived workspaces"
					value={workspaces.data.items.length - activeWorkspaces.length}
				/>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				{activeWorkspaces.map((workspace) => (
					<Link
						key={workspace.id}
						to="/workspaces/$slug"
						params={{ slug: workspace.slug ?? workspace.id }}
						className="rounded-xl border border-foreground/10 p-5 hover:bg-foreground/[0.03]"
					>
						{workspace.name}
					</Link>
				))}
			</div>
		</main>
	);
}

function Metric({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-xl border border-foreground/10 p-5">
			<p className="text-muted-foreground text-sm">{label}</p>
			<p className="mt-2 font-semibold text-3xl">{value}</p>
		</div>
	);
}

export const Route = createFileRoute("/overview")({
	component: OverviewPage,
});
