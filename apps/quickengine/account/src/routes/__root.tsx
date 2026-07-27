import { authClient } from "@quickengine/auth/client";
import {
	LoadingScreen,
	primaryButton,
	StatusScreen,
	textLink,
} from "@quickengine/ui";
import {
	Sidebar,
	SidebarInset,
	SidebarProvider,
} from "@quickengine/ui/components/ui/sidebar";
import {
	type QueryClient,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Outlet,
	redirect,
	useRouterState,
} from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { Breadcrumbs } from "../components/breadcrumbs";
import { DashboardNav } from "../components/nav";
import { NotificationBell } from "../components/notification-bell";
import { ProfileMenu } from "../components/profile-menu";
import { SearchBar } from "../components/search-bar";
import { TeamSwitcher } from "../components/team-switcher";
import { ThemeProvider } from "../components/theme-provider";
import { UpgradeButton } from "../components/upgrade-button";
import {
	accountQueries,
	activeOrganization,
	useActiveOrganization,
} from "../lib/account-api";
import { clientEnv } from "../lib/env";

/**
 * The account shell, and the app's authentication boundary.
 *
 * 🔴 **This fails CLOSED, unlike marketing and sign-in.**
 *
 * `web` renders even when the session lookup breaks, because a sales page must
 * always be visible. `auth` shows the sign-in form on any error, because the
 * worst case is a signed-in user seeing a login screen.
 *
 * Neither is acceptable here. This app displays organizations, billing and team
 * membership, so an unverifiable session must be treated exactly like no session
 * at all: **error, timeout and absent all take the same path — out.** Anything
 * else flashes private data to someone whose identity we could not confirm.
 */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		beforeLoad: async ({ location }) => {
			try {
				const { data } = await authClient.getSession();
				if (data?.session && data.user) return { user: data.user };
			} catch {
				// Fall through to the redirect. An unverifiable session is not a session.
			}
			const target = new URL("/signin", clientEnv.AUTH_URL);
			target.searchParams.set(
				"redirect",
				window.location.origin + location.href,
			);
			throw redirect({ href: target.toString() });
		},
		component: RootLayout,
		errorComponent: ErrorScreen,
		notFoundComponent: NotFoundScreen,
		pendingComponent: LoadingScreen,
	},
);

function RootLayout() {
	return (
		<ThemeProvider>
			<AccountShell />
		</ThemeProvider>
	);
}

function AccountShell() {
	const queryClient = useQueryClient();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const { user } = Route.useRouteContext();
	const { organizations, active } = useActiveOrganization();
	const notifications = useQuery(accountQueries.notifications());
	const plan = useQuery(accountQueries.plan(active?.id ?? ""));

	if (organizations.isPending || notifications.isPending)
		return <LoadingScreen />;
	if (organizations.isError || notifications.isError) {
		throw organizations.error ?? notifications.error;
	}

	const outsideConsole =
		pathname === "/onboarding" ||
		pathname.startsWith("/join/") ||
		pathname.startsWith("/billing");
	if (outsideConsole) return <Outlet />;

	const selectOrganization = (organizationId: string) => {
		activeOrganization.write(organizationId);
		queryClient.setQueryData(["account", "activeOrganization"], organizationId);
	};
	const inbox = notifications.data.items.map((item) => ({
		...item,
		unread: item.readAt === null,
	}));

	return (
		<SidebarProvider style={{ "--header-height": "3.5rem" } as CSSProperties}>
			<header className="fixed inset-x-0 top-0 z-30 flex h-(--header-height) items-center border-sidebar-border border-b bg-background">
				<div className="flex h-full w-(--sidebar-width) items-center border-sidebar-border border-r px-4">
					<TeamSwitcher
						orgs={organizations.data.items}
						activeOrgId={active?.id ?? ""}
						tier={plan.data?.planId ?? "Free"}
						onSelect={selectOrganization}
					/>
				</div>
				<div className="flex flex-1 items-center justify-between px-4">
					<Breadcrumbs />
					<div className="flex items-center gap-3">
						<SearchBar />
						<UpgradeButton />
						<NotificationBell
							items={inbox}
							unread={notifications.data.unread}
						/>
						<ProfileMenu
							seed={user.id}
							name={user.name ?? ""}
							email={user.email}
						/>
					</div>
				</div>
			</header>
			<Sidebar>
				<DashboardNav />
			</Sidebar>
			<SidebarInset className="pt-(--header-height)">
				<Outlet />
			</SidebarInset>
		</SidebarProvider>
	);
}

function NotFoundScreen() {
	return (
		<StatusScreen
			code="404"
			title="Page not found"
			message="That page doesn't exist."
			action={
				<a href="/" className={textLink}>
					Back to your account
				</a>
			}
		/>
	);
}

function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
	return (
		<StatusScreen
			code="500"
			title="Something went wrong"
			message="An unexpected error occurred. Try again in a moment."
			action={
				<button type="button" onClick={reset} className={primaryButton}>
					Try again
				</button>
			}
		/>
	);
}
