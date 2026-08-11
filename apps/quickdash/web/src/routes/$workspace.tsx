import { ChatCircleIcon, CodeIcon } from "@phosphor-icons/react";
import { ConsoleShell, Logo } from "@quickengine/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Breadcrumbs } from "../components/breadcrumbs";
import { FirstActionChecklist } from "../components/first-action-checklist";
import { ProfileMenu } from "../components/profile-menu";
import { QuickDashOrientation } from "../components/quickdash-orientation";
import { SidebarNav, SidebarTop } from "../components/sidebar-nav";
import { WorkspaceDevelopers } from "../components/workspace-developers";
import { WorkspaceSearch } from "../components/workspace-search";
import { WorkspaceSwitcher } from "../components/workspace-switcher";
import { quickDashQueries } from "../lib/quickdash-api";

/**
 * The workspace shell — inset layout, deliberately empty.
 *
 * `variant="inset"` is shadcn's own dashboard-01 layout and it was already in
 * `sidebar.tsx`: the content panel gets `m-2 ml-0 rounded-xl shadow-sm` and the
 * wrapper takes the sidebar's colour, which is the floating-panel look in the
 * mock. Installing the block would have added charts, a data table, four nav
 * components and a JSON file of invented records to the SHARED ui package —
 * content that would be deleted immediately, and fake data in a repo where
 * fabricated records have already caused problems.
 *
 * ⚠️ Cleared for redesign 2026-07-31 — **presentation only**. Nothing was
 * deleted. Still on disk, still working, simply not rendered:
 *
 *   components/module-nav.tsx              the sidebar and its module list
 *   components/workspace-switcher.tsx      org + workspace switching
 *   components/command-palette.tsx         ⌘K search
 *   components/profile-menu.tsx            avatar menu and sign-out
 *   components/first-action-checklist.tsx  first-value checklist
 *   components/quickdash-orientation.tsx   the one-time orientation
 *   components/*-view.tsx                  all fifteen module views
 *
 * The route context, workspace query, auth guard and every module route are
 * untouched.
 */
function WorkspaceShell() {
	const { workspace } = Route.useParams();
	const { user } = Route.useRouteContext();
	const context = useQuery(quickDashQueries.context(workspace));
	const plan = useQuery(
		quickDashQueries.plan(context.data?.workspace.organizationId),
	);

	if (!user) throw new Error("Authenticated user missing from route context.");
	if (context.isPending) return <main className="min-h-dvh bg-void" />;
	if (context.isError) throw context.error;

	return (
		<ConsoleShell
			switcher={
				<WorkspaceSwitcher
					active={context.data.workspace}
					workspaces={context.data.workspaces}
					organizationId={context.data.workspace.organizationId ?? null}
					planId={plan.data?.planId ?? null}
				/>
			}
			breadcrumbs={<Breadcrumbs workspaceId={workspace} />}
			actions={
				<>
					<a
						href="/"
						className="btn btn-secondary pointer-events-auto inline-flex h-7 items-center rounded-full bg-void px-3 font-body font-[450] text-[13px] text-ink"
					>
						Upgrade
					</a>
					<WorkspaceSearch
						workspaceId={workspace}
						moduleIds={context.data.modules.map((module) => module.id)}
					/>
				</>
			}
			account={
				<ProfileMenu
					workspaceId={workspace}
					seed={user.id}
					name={user.name ?? ""}
					email={user.email}
					planId={plan.data?.planId ?? null}
					mobileItems={
						<>
							<button
								type="button"
								className="inline-flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-ink"
							>
								<ChatCircleIcon size={14} className="shrink-0 text-dim" />
								Feedback
							</button>
							{/* A route, not the dialog. The dialog is 960px wide with a 224px
							    rail inside it — on a 375px phone that leaves 121px of content.
							    Connect already exists as a real page with a back button, so
							    mobile goes there and desktop keeps the dialog. */}
							<a
								href={`/${workspace}/connect`}
								className="inline-flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-ink"
							>
								<CodeIcon size={14} className="shrink-0 text-dim" />
								Developers
							</a>
						</>
					}
				/>
			}
			navTop={
				<SidebarTop
					workspaceId={workspace}
					moduleIds={context.data.modules.map((module) => module.id)}
				/>
			}
			nav={
				<SidebarNav
					workspaceId={workspace}
					moduleIds={context.data.modules.map((module) => module.id)}
				/>
			}
			navBottom={
				<>
					<button
						type="button"
						className="inline-flex h-8 items-center gap-2.5 rounded-md px-2 text-dim transition-colors hover:bg-field hover:text-ink"
					>
						<ChatCircleIcon size={16} className="shrink-0" />
						<span className="font-body text-[13px]">Feedback</span>
					</button>

					<WorkspaceDevelopers
						workspaceId={workspace}
						workspaceSlug={context.data.workspace.slug}
						workspaceName={context.data.workspace.name}
						businessType={context.data.workspace.businessType}
						moduleIds={context.data.modules.map((module) => module.id)}
						trigger={
							<button
								type="button"
								className="inline-flex h-8 items-center gap-2.5 rounded-md px-2 text-dim transition-colors hover:bg-field hover:text-ink"
							>
								<CodeIcon size={16} className="shrink-0" />
								<span className="font-body text-[13px]">Developers</span>
							</button>
						}
					/>
				</>
			}
			overlays={
				<>
					{!context.data.orientation.shouldOffer ? (
						<FirstActionChecklist
							workspaceId={workspace}
							items={context.data.checklist.items}
							initialCollapsed={context.data.checklist.collapsed}
							initialDismissed={context.data.checklist.dismissed}
						/>
					) : null}

					<QuickDashOrientation
						key={String(context.data.orientation.shouldOffer)}
						workspaceId={workspace}
						workspaceName={context.data.workspace.name}
						shouldOffer={context.data.orientation.shouldOffer}
					/>
				</>
			}
		>
			{context.data.workspace.environment === "test" ? (
				<div className="relative z-20 border-amber-500/30 border-b bg-amber-400/10 px-4 py-2 text-center font-medium text-amber-700 text-xs uppercase tracking-[0.16em] dark:text-amber-300">
					Test mode · sandbox payments and disposable business data
				</div>
			) : null}
			{/* Watermark behind the content — a module view lands on top of it. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 flex items-center justify-center"
			>
				<Logo className="h-40 w-auto text-ink opacity-[0.07] dark:opacity-[0.03]" />
			</div>

			<Outlet />
		</ConsoleShell>
	);
}

export const Route = createFileRoute("/$workspace")({
	component: WorkspaceShell,
});
