import { getSession } from "@quickengine/auth/server";
import {
	and,
	db,
	desc,
	eq,
	isNull,
	listOrganizationInvitations,
	listOrganizationMembers,
	or,
} from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Panel, PanelLabel, StatCard } from "../../_components/surface";
import { resolveActiveOrg } from "../../_lib/active-org";
import { getBusinessType } from "../../_lib/workspace-catalog";

export const metadata: Metadata = { title: "Overview" };

// The cross-workspace umbrella for the active organization (read-only). Aggregates are the
// honest, cheap ones — structure and configuration across the org's workspaces. Money/usage
// roll-ups and an activity feed wire in with the billing, usage, and audit-log slices.
export default async function Page() {
	const session = await getSession(await headers());
	if (!session) return null;
	const active = await resolveActiveOrg(session.user.id);
	if (!active) return null;

	const scope = active.isPersonal
		? or(
				eq(quickengineWorkspaces.organizationId, active.id),
				and(
					eq(quickengineWorkspaces.ownerId, session.user.id),
					isNull(quickengineWorkspaces.organizationId),
				),
			)
		: eq(quickengineWorkspaces.organizationId, active.id);

	const [workspaces, members, invitations] = await Promise.all([
		db
			.select({
				id: quickengineWorkspaces.id,
				name: quickengineWorkspaces.name,
				slug: quickengineWorkspaces.slug,
				businessType: quickengineWorkspaces.businessType,
				modules: quickengineWorkspaces.modules,
				archivedAt: quickengineWorkspaces.archivedAt,
			})
			.from(quickengineWorkspaces)
			.where(scope)
			.orderBy(desc(quickengineWorkspaces.createdAt)),
		listOrganizationMembers(active.id),
		listOrganizationInvitations(active.id),
	]);

	const activeWorkspaces = workspaces.filter(
		(workspace) => !workspace.archivedAt,
	);
	const modulesEnabled = activeWorkspaces.reduce(
		(sum, workspace) => sum + workspace.modules.length,
		0,
	);
	const pending = invitations.filter(
		(invite) => invite.status === "pending",
	).length;

	return (
		<div className="space-y-4 p-6">
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label="Active workspaces"
					value={String(activeWorkspaces.length)}
					hint={
						workspaces.length > activeWorkspaces.length
							? `${workspaces.length} total incl. archived`
							: "in this organization"
					}
				/>
				<StatCard
					label="Members"
					value={String(members.length)}
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
				{workspaces.length === 0 ? (
					<p className="mt-3 text-muted-foreground text-sm">
						No workspaces in this organization yet.
					</p>
				) : (
					<div className="mt-3 divide-y divide-foreground/[0.06]">
						{workspaces.map((workspace) => {
							const type = getBusinessType(workspace.businessType);
							const moduleCount = workspace.modules.length;
							return (
								<Link
									key={workspace.id}
									href={`/workspaces/${workspace.slug}`}
									className="flex items-center justify-between py-3 text-sm transition-opacity hover:opacity-70"
								>
									<div>
										<span className="text-foreground">{workspace.name}</span>
										<span className="ml-2 text-muted-foreground text-xs">
											{type?.name ?? workspace.businessType}
											{workspace.archivedAt ? " · archived" : ""}
										</span>
									</div>
									<span className="text-muted-foreground text-xs">
										{moduleCount} module{moduleCount === 1 ? "" : "s"}
									</span>
								</Link>
							);
						})}
					</div>
				)}
			</Panel>
		</div>
	);
}
