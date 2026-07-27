import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@quickengine/ui/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { CommandPalette } from "../components/command-palette";
import { FirstActionChecklist } from "../components/first-action-checklist";
import { QuickDashOrientation } from "../components/quickdash-orientation";
import { clientEnv } from "../lib/env";
import { quickDashQueries } from "../lib/quickdash-api";

function WorkspaceShell() {
	const { workspace } = Route.useParams();
	const context = useQuery(quickDashQueries.context(workspace));
	if (context.isPending) return <main className="p-6">Loading workspace…</main>;
	if (context.isError) throw context.error;
	return (
		<SidebarProvider style={{ "--header-height": "3.5rem" } as CSSProperties}>
			<header className="fixed inset-x-0 top-0 z-30 flex h-(--header-height) items-center justify-between border-b bg-background px-4">
				<Link to="/$workspace" params={{ workspace }} className="font-medium">
					{context.data.workspace.name}
				</Link>
				<div className="flex items-center gap-3 text-sm">
					<CommandPalette workspaceId={workspace} />
					<a href={clientEnv.ACCOUNT_URL}>Account</a>
					<a href="/signout">Sign out</a>
				</div>
			</header>
			<Sidebar className="pt-(--header-height)">
				<nav className="space-y-1 p-3">
					<Link to="/$workspace" params={{ workspace }} className="block p-2">
						Overview
					</Link>
					{context.data.modules.map((module) => (
						<Link
							key={module.id}
							to="/$workspace/$module"
							params={{ workspace, module: module.id }}
							className="block rounded p-2 capitalize hover:bg-sidebar-accent"
						>
							{module.id.replaceAll("-", " ")}
						</Link>
					))}
				</nav>
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
