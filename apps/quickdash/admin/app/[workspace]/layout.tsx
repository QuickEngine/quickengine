import { getSession } from "@quickengine/auth/server";
import {
	getFirstActionChecklistState,
	getQuickDashOrientationState,
} from "@quickengine/db";
import {
	accountSecurityGuidedGoal,
	listModules,
	resolveFirstActions,
} from "@quickengine/module-registry";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@quickengine/ui/components/ui/sidebar";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { CommandPalette } from "../_components/command-palette";
import { FirstActionChecklist } from "../_components/first-action-checklist";
import { ModuleNav } from "../_components/module-nav";
import { ProfileMenu } from "../_components/profile-menu";
import { QuickDashOrientation } from "../_components/quickdash-orientation";
import { WorkspaceSwitcher } from "../_components/workspace-switcher";
import {
	buildFirstActionChecklistItems,
	resolveInitialFirstActionChecklistCollapsed,
} from "../_lib/first-action-checklist";
import { resolveDatabaseGuidedStepCompletions } from "../_lib/guided-action-completion-database";
import { resolveGuidedActions } from "../_lib/guided-action-resolution";
import { getModuleNavigation } from "../_lib/module-navigation";
import {
	listAccessibleWorkspaces,
	requireWorkspaceAccess,
} from "../_lib/workspace-access";

const ACCOUNT_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ?? "http://localhost:3001";

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
	const firstActions = resolveFirstActions({
		manifests: listModules(),
		enabledModuleIds: access.modules.map((module) => module.id),
	});
	const [guidedStepCompletions, firstActionState, orientationState] =
		await Promise.all([
			resolveDatabaseGuidedStepCompletions(
				access.workspace.id,
				firstActions.flatMap((action) => action.steps.map((step) => step.id)),
			),
			getFirstActionChecklistState(session.user.id, access.workspace.id),
			getQuickDashOrientationState(session.user.id, access.workspace.id),
		]);
	const guidedActions = resolveGuidedActions(
		firstActions,
		guidedStepCompletions,
	);
	const firstActionItems = buildFirstActionChecklistItems(
		access.workspace.id,
		guidedActions.goals,
		guidedActions.nextStep?.id ?? null,
		{
			goal: accountSecurityGuidedGoal,
			href: `${ACCOUNT_URL}/settings/security`,
		},
	);

	return (
		<SidebarProvider style={{ "--header-height": "3.5rem" } as CSSProperties}>
			<header className="fixed inset-x-0 top-0 z-30 flex h-(--header-height) items-center border-sidebar-border border-b bg-background">
				<div
					data-orientation-target="workspace-switcher"
					className="flex h-full w-(--sidebar-width) items-center border-sidebar-border border-r px-4"
				>
					<WorkspaceSwitcher
						active={access.workspace}
						workspaces={workspaces}
						organizationId={access.organizationId}
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
							workspaceId={access.workspace.id}
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
			{!orientationState.shouldOffer && (
				<FirstActionChecklist
					workspaceId={access.workspace.id}
					items={firstActionItems}
					initialCollapsed={resolveInitialFirstActionChecklistCollapsed({
						hasStoredState: firstActionState.hasStoredState,
						storedCollapsed: firstActionState.collapsed,
					})}
					initialDismissed={firstActionState.dismissedAt !== null}
				/>
			)}
			<QuickDashOrientation
				workspaceId={access.workspace.id}
				workspaceName={access.workspace.name}
				shouldOffer={orientationState.shouldOffer}
			/>
		</SidebarProvider>
	);
}
