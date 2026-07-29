import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@quickengine/ui/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { CommandPalette } from "../components/command-palette";
import { FirstActionChecklist } from "../components/first-action-checklist";
import { ModuleNav } from "../components/module-nav";
import { ProfileMenu } from "../components/profile-menu";
import { QuickDashOrientation } from "../components/quickdash-orientation";
import { WorkspaceSwitcher } from "../components/workspace-switcher";
import { quickDashQueries } from "../lib/quickdash-api";

function WorkspaceShell() {
	const { workspace } = Route.useParams();
	const { user } = Route.useRouteContext();
	const context = useQuery(quickDashQueries.context(workspace));
	if (!user) throw new Error("Authenticated user missing from route context.");
	if (context.isPending) return <main className="p-6">Loading workspace…</main>;
	if (context.isError) throw context.error;
	return (
		<SidebarProvider style={{ "--header-height": "3.5rem" } as CSSProperties}>
			<header className="fixed inset-x-0 top-0 z-30 flex h-(--header-height) items-center border-sidebar-border border-b bg-background">
				<div
					data-orientation-target="workspace-switcher"
					className="flex h-full w-(--sidebar-width) items-center border-sidebar-border border-r px-4"
				>
					<WorkspaceSwitcher
						active={context.data.workspace}
						workspaces={context.data.workspaces}
						organizationId={context.data.workspace.organizationId ?? null}
					/>
				</div>
				<div className="flex flex-1 items-center justify-between px-4">
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">
							{context.data.workspace.name}
						</p>
						<p className="truncate text-muted-foreground text-xs">
							QuickDash workspace
						</p>
					</div>
					<div className="flex items-center gap-3">
						<CommandPalette workspaceId={workspace} />
						<ProfileMenu
							workspaceId={workspace}
							seed={user.id}
							name={user.name ?? ""}
							email={user.email}
						/>
					</div>
				</div>
			</header>
			<Sidebar>
				<ModuleNav
					workspaceId={workspace}
					workspaceSlug={context.data.workspace.slug}
					moduleIds={context.data.modules.map((module) => module.id)}
				/>
			</Sidebar>
			<SidebarInset className="pt-(--header-height)">
				<Outlet />
			</SidebarInset>
			<QuickDashOrientation
				workspaceId={workspace}
				workspaceName={context.data.workspace.name}
				shouldOffer={context.data.orientation.shouldOffer}
			/>
			{!context.data.orientation.shouldOffer && (
				<FirstActionChecklist
					workspaceId={workspace}
					items={context.data.checklist.items}
					initialCollapsed={context.data.checklist.collapsed}
					initialDismissed={context.data.checklist.dismissed}
				/>
			)}
		</SidebarProvider>
	);
}

export const Route = createFileRoute("/$workspace")({
	component: WorkspaceShell,
});
