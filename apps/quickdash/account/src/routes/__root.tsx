import { GearSixIcon } from "@phosphor-icons/react";
import { authClient } from "@quickengine/auth/client";
import {
	ConsoleShell,
	LoadingScreen,
	RequestErrorScreen,
	StatusScreen,
	textLink,
} from "@quickengine/ui";
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
import { AccountNav, AccountNavTop } from "../components/account-nav";
import { Breadcrumbs } from "../components/breadcrumbs";
import { NotificationBell } from "../components/notification-bell";
import { ProfileMenu } from "../components/profile-menu";
import { SearchBar } from "../components/search-bar";
import { SettingsDialog } from "../components/settings-dialog";
import { TeamSwitcher } from "../components/team-switcher";
import { ThemeProvider } from "../components/theme-provider";
import { UpgradeButton } from "../components/upgrade-button";
import {
	accountQueries,
	activeOrganization,
	useActiveOrganization,
} from "../lib/account-api";
import { api } from "../lib/api";
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
			const signIn = () => {
				const target = new URL("/signin", clientEnv.AUTH_URL);
				target.searchParams.set(
					"redirect",
					window.location.origin + location.href,
				);
				return redirect({ href: target.toString() });
			};

			let authenticated:
				| { user: { id: string; name: string; email: string } }
				| undefined;
			try {
				const { data } = await authClient.getSession();
				if (data?.session && data.user) authenticated = { user: data.user };
			} catch {
				// An unverifiable session is not a session.
			}
			if (!authenticated) throw signIn();

			// 🔴 Past this point the session is REAL, so a failure here is our API
			// being unreachable — not the visitor being signed out. Redirecting on
			// it bounces off the sign-in guard, which can see the very same valid
			// session, and sends the browser back here: an infinite loop.
			//
			// This is not hypothetical. It took production down when the account
			// rewrite still pointed at the retired `api.quickengine.xyz`: sign-in
			// succeeded, `/account/state` hit a dead host, and the two guards threw
			// the user back and forth forever.
			//
			// So only a genuine 401 returns to sign-in. Everything else surfaces as
			// an error screen, which is recoverable and tells the truth.
			let onboardingCompleted = false;
			try {
				const state = (
					await api.request<{
						onboardingCompletedAt: string | null;
					}>("/account/state")
				).data;
				onboardingCompleted = Boolean(state.onboardingCompletedAt);
			} catch (error) {
				if ((error as { status?: number })?.status === 401) throw signIn();
				throw error;
			}

			const isOnboarding = location.pathname === "/onboarding";
			if (!onboardingCompleted && !isOnboarding)
				throw redirect({ to: "/onboarding" });
			if (onboardingCompleted && isOnboarding) throw redirect({ to: "/" });
			return authenticated;
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
		// The shared shell. QuickDash is master: every measurement in ConsoleShell
		// came from it, and Account conforms rather than the reverse. Only content
		// differs here — switcher, nav and actions.
		<ConsoleShell
			switcher={
				<TeamSwitcher
					orgs={organizations.data.items}
					activeOrgId={active?.id ?? ""}
					tier={plan.data?.planId ?? "Free"}
					onSelect={selectOrganization}
				/>
			}
			breadcrumbs={<Breadcrumbs />}
			actions={
				<>
					<UpgradeButton />
					<SearchBar />
					<NotificationBell items={inbox} unread={notifications.data.unread} />
				</>
			}
			account={
				<ProfileMenu
					seed={user.id}
					name={user.name ?? ""}
					email={user.email}
					planId={plan.data?.planId ?? null}
					// A route, not the dialog. The dialog is 960px wide with a 224px rail
					// inside it — on a 375px phone that leaves 121px of content. These
					// settings screens already exist at /settings/*, with a back button.
					mobileItems={
						<a
							href="/settings/profile"
							className="inline-flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-ink"
						>
							<GearSixIcon size={14} className="shrink-0 text-dim" />
							Settings
						</a>
					}
				/>
			}
			navTop={<AccountNavTop />}
			nav={<AccountNav />}
			navBottom={
				/* The real dialog — profile, security, billing, sessions, theme — not a
				   link out. It already existed and I replaced it with a link when the
				   shell was rebuilt; this restores it. Mirrors QuickDash's Developers
				   dialog: same size, same rail. */
				<SettingsDialog>
					<button
						type="button"
						className="inline-flex h-8 items-center gap-2.5 rounded-md px-2 text-dim transition-colors hover:bg-field hover:text-ink"
					>
						<GearSixIcon size={16} className="shrink-0" />
						<span className="font-body text-[13px]">Settings</span>
					</button>
				</SettingsDialog>
			}
		>
			<Outlet />
		</ConsoleShell>
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

function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
	return (
		<RequestErrorScreen
			error={error}
			onRetry={reset}
			homeHref="/"
			homeLabel="Back to your account"
		/>
	);
}
