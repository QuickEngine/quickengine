import { authClient } from "@quickengine/auth/client";
import {
	ConsoleShell,
	SandboxBanner,
	SidebarAccount,
	SidebarName,
} from "@quickengine/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { type MouseEventHandler, useState } from "react";
import { WorkspaceNav } from "../components/workspace-nav";
import { WorkspaceNotifications } from "../components/workspace-notifications";
import { WorkspaceSearch } from "../components/workspace-search";
import { clientEnv } from "../lib/env";
import {
	clearNativeToken,
	isNativeShell,
	nativeAuthHeaders,
} from "../lib/native-auth";
import { quickDashQueries } from "../lib/quickdash-api";

function WorkspaceShell() {
	const { workspace } = Route.useParams();
	const { user } = Route.useRouteContext();
	const context = useQuery(quickDashQueries.context(workspace));
	const plan = useQuery(
		quickDashQueries.plan(context.data?.workspace.organizationId),
	);
	const notifications = useQuery(quickDashQueries.notifications());
	const [searchOpen, setSearchOpen] = useState(false);
	// The bell swaps what the sidebar's navigation slot renders rather than
	// opening a popover over it — same pattern as Account, so the two consoles
	// behave identically.
	const [sidebarContext, setSidebarContext] = useState<
		"navigation" | "notifications"
	>("navigation");
	if (!user) throw new Error("Authenticated user missing from route context.");

	const nativeSignOut: MouseEventHandler<HTMLAnchorElement> | undefined =
		isNativeShell()
			? async (event) => {
					event.preventDefault();
					try {
						await authClient.signOut({
							fetchOptions: { headers: nativeAuthHeaders() },
						});
					} catch {
						// Clearing the local token is authoritative for this native window.
					}
					clearNativeToken();
					window.location.replace("/native-signin");
				}
			: undefined;

	return (
		<ConsoleShell
			// Driven by the workspace's own environment, so it cannot disagree with
			// what the API will actually do with a payment.
			banner={
				context.data?.workspace.environment === "test" ? (
					<SandboxBanner />
				) : undefined
			}
			switcher={
				<SidebarName
					name={context.data?.workspace.name ?? ""}
					// 🔴 Test mode is otherwise invisible, which is how a real card gets
					// taken in a test workspace — or a test card in the live one.
					badge={context.data?.workspace.environment === "test" ? "Test" : null}
					currentId={context.data?.workspace.id ?? ""}
					items={(context.data?.workspaces ?? []).map((item) => ({
						id: item.id,
						name: item.name,
						badge: item.environment === "test" ? "Test" : null,
					}))}
					onSelect={(workspaceId) => {
						window.location.assign(`/${workspaceId}`);
					}}
					searchLabel="Find workspace"
					createLabel="Create workspace"
					createHref={`${clientEnv.ACCOUNT_URL}/workspaces/new`}
					onSearch={() => setSearchOpen(true)}
					onNotifications={() =>
						setSidebarContext((current) =>
							current === "notifications" ? "navigation" : "notifications",
						)
					}
					notificationCount={notifications.data?.unread ?? 0}
					notificationsActive={sidebarContext === "notifications"}
				/>
			}
			nav={
				sidebarContext === "notifications" ? (
					<WorkspaceNotifications
						items={notifications.data?.items ?? []}
						unread={notifications.data?.unread ?? 0}
					/>
				) : (
					<WorkspaceNav
						workspaceId={workspace}
						modules={context.data?.modules ?? []}
					/>
				)
			}
			account={
				<SidebarAccount
					name={user.name ?? ""}
					planId={plan.data?.planId ?? null}
					accountUrl={clientEnv.ACCOUNT_URL}
					authUrl={clientEnv.AUTH_URL}
					webUrl={clientEnv.WEB_URL}
					// Contextual: inside a workspace, "Settings" is the workspace's.
					settingsHref={`/${workspace}/settings`}
					settingsLink={({ href, className, children }) => (
						<Link to={href} className={className}>
							{children}
						</Link>
					)}
					onSignOut={nativeSignOut}
				/>
			}
			overlays={
				<WorkspaceSearch
					open={searchOpen}
					onOpenChange={setSearchOpen}
					workspaceId={workspace}
					modules={context.data?.modules ?? []}
				/>
			}
		>
			<Outlet />
		</ConsoleShell>
	);
}

export const Route = createFileRoute("/$workspace")({
	component: WorkspaceShell,
});
