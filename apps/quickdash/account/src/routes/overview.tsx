import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Panel, PanelLabel, StatCard } from "../components/surface";
import { accountQueries, useActiveOrganization } from "../lib/account-api";
import { getBusinessType } from "../lib/workspace-catalog";

function OverviewPage() {
	const { active } = useActiveOrganization();
	const workspaces = useQuery(accountQueries.workspaces(active?.id ?? ""));
	const members = useQuery(accountQueries.members(active?.id ?? ""));
	const invitations = useQuery(accountQueries.invitations(active?.id ?? ""));
	if (workspaces.isPending || members.isPending || invitations.isPending)
		return <main className="p-6">Loading overview…</main>;
	if (workspaces.isError || members.isError || invitations.isError)
		throw workspaces.error ?? members.error ?? invitations.error;

	const activeWorkspaces = workspaces.data.items.filter(
		(workspace) => !workspace.archivedAt,
	);
	const modulesEnabled = activeWorkspaces.reduce(
		(sum, workspace) => sum + workspace.modules.length,
		0,
	);
	const pending = invitations.data.items.filter(
		(invitation) => invitation.status === "pending",
	).length;

	return (
		<div className="space-y-4 p-6">
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label="Active workspaces"
					value={String(activeWorkspaces.length)}
					hint={
						workspaces.data.items.length > activeWorkspaces.length
							? `${workspaces.data.items.length} total incl. archived`
							: "in this organization"
					}
				/>
				<StatCard
					label="Members"
					value={String(members.data.items.length)}
					hint="in this organization"
				/>
				<StatCard
					label="Pending invites"
					value={String(pending)}
					hint="awaiting acceptance"
				/>
				<StatCard
					label="Modules enabled"
					value={String(modulesEnabled)}
					hint={`across ${activeWorkspaces.length} workspace${
						activeWorkspaces.length === 1 ? "" : "s"
					}`}
				/>
			</section>
			<Panel>
				<PanelLabel>Workspaces</PanelLabel>
				{workspaces.data.items.length === 0 ? (
					<p className="mt-3 text-muted-foreground text-sm">
						No workspaces in this organization yet.
					</p>
				) : (
					<div className="mt-3 divide-y divide-foreground/[0.06]">
						{workspaces.data.items.map((workspace) => (
							<Link
								key={workspace.id}
								to="/workspaces/$slug"
								params={{ slug: workspace.slug ?? workspace.id }}
								className="flex items-center justify-between py-3 text-sm transition-opacity hover:opacity-70"
							>
								<div>
									<span>{workspace.name}</span>
									<span className="ml-2 text-muted-foreground text-xs">
										{getBusinessType(workspace.businessType)?.name ??
											workspace.businessType}
										{workspace.archivedAt ? " · archived" : ""}
									</span>
								</div>
								<span className="text-muted-foreground text-xs">
									{workspace.modules.length} module
									{workspace.modules.length === 1 ? "" : "s"}
								</span>
							</Link>
						))}
					</div>
				)}
			</Panel>
		</div>
	);
}

export const Route = createFileRoute("/overview")({ component: OverviewPage });
