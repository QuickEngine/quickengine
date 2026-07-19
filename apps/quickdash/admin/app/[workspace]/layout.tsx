import { getSession } from "@quickengine/auth/server";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@quickengine/ui/components/ui/sidebar";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { CommandPalette } from "../_components/command-palette";
import { ModuleNav } from "../_components/module-nav";
import { ProfileMenu } from "../_components/profile-menu";
import { WorkspaceSwitcher } from "../_components/workspace-switcher";
import { getModuleNavigation } from "../_lib/module-navigation";
import {
	listAccessibleWorkspaces,
	requireWorkspaceAccess,
} from "../_lib/workspace-access";

export default async function WorkspaceLayout({
	children,
	params,
}: Readonly<{
	children: React.ReactNode;
	params: Promise<{ workspace: string }>;
}>) {
	const session = await getSession(await headers());
	if (!session) {
		return null;
	}
	const { workspace: workspaceId } = await params;
	const [access, workspaces] = await Promise.all([
		requireWorkspaceAccess(session.user.id, workspaceId),
		listAccessibleWorkspaces(session.user.id),
	]);
	if (!access) {
		notFound();
	}
	const navigation = access.modules.map((module) => {
		const item = getModuleNavigation(module.id);
		if (!item) {
			throw new Error(`MODULE_NAVIGATION_MISSING:${module.id}`);
		}
		return item;
	});

	return (
		<SidebarProvider style={{ "--header-height": "3.5rem" } as CSSProperties}>
			<header className="fixed inset-x-0 top-0 z-30 flex h-(--header-height) items-center border-sidebar-border border-b bg-background">
				<div className="flex h-full w-(--sidebar-width) items-center border-sidebar-border border-r px-4">
					<WorkspaceSwitcher
						active={access.workspace}
						workspaces={workspaces}
					/>
				</div>
				<div className="flex flex-1 items-center justify-between px-4">
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">
							{access.workspace.name}
						</p>
						<p className="truncate text-muted-foreground text-xs">
							QuickDash workspace
						</p>
					</div>
					<div className="flex items-center gap-3">
						<CommandPalette workspaceId={access.workspace.id} />
						<ProfileMenu
							seed={session.user.id}
							name={session.user.name ?? ""}
							email={session.user.email}
						/>
					</div>
				</div>
			</header>
			<Sidebar>
				<ModuleNav
					workspaceId={access.workspace.id}
					workspaceSlug={access.workspace.slug}
					modules={navigation}
				/>
			</Sidebar>
			<SidebarInset className="pt-(--header-height)">{children}</SidebarInset>
		</SidebarProvider>
	);
}
