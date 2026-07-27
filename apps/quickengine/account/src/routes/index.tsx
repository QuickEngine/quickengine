import { Button } from "@quickengine/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { accountQueries, useActiveOrganization } from "../lib/account-api";

function WorkspacesPage() {
	const { active } = useActiveOrganization();
	const workspaces = useQuery(accountQueries.workspaces(active?.id ?? ""));

	if (!active) {
		return (
			<main className="p-6">
				<p className="text-muted-foreground">No organization was found.</p>
			</main>
		);
	}
	if (workspaces.isPending) {
		return (
			<main className="p-6 text-muted-foreground">Loading workspaces…</main>
		);
	}
	if (workspaces.isError) throw workspaces.error;

	return (
		<main className="space-y-6 p-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-semibold text-2xl">Workspaces</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Business backends belonging to {active.name}.
					</p>
				</div>
				<Button asChild>
					<Link to="/workspaces/new">New workspace</Link>
				</Button>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{workspaces.data.items.map((workspace) => (
					<Link
						key={workspace.id}
						to="/workspaces/$slug"
						params={{ slug: workspace.slug ?? workspace.id }}
						className="rounded-xl border border-foreground/10 p-5 transition-colors hover:bg-foreground/[0.03]"
					>
						<div className="flex items-center justify-between gap-3">
							<h2 className="font-medium">{workspace.name}</h2>
							{workspace.archivedAt && (
								<span className="text-muted-foreground text-xs">Archived</span>
							)}
						</div>
						<p className="mt-2 text-muted-foreground text-sm">
							{workspace.businessType}
						</p>
					</Link>
				))}
				{workspaces.data.items.length === 0 && (
					<p className="col-span-full rounded-xl border border-dashed p-10 text-center text-muted-foreground">
						This organization has no workspaces yet.
					</p>
				)}
			</div>
		</main>
	);
}

export const Route = createFileRoute("/")({
	component: WorkspacesPage,
});
