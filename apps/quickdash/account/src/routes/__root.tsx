import { authClient } from "@quickengine/auth/client";
import {
	type ConsoleLink,
	ConsoleShell,
	SidebarAccount,
	SidebarName,
} from "@quickengine/ui";
import {
	type QueryClient,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	Link,
	Outlet,
	redirect,
	useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import { ErrorScreen, NotFoundScreen } from "@/components/status-screens";
import { AccountNav } from "../components/account-nav";
import { AccountNotifications } from "../components/account-notifications";
import { AccountSearch } from "../components/account-search";
import { FeedbackDialog } from "../components/feedback-dialog";
import { SkeletonScreen } from "../components/skeletons";
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
			/**
			 * 🔴 A thrown request is NOT the same as "not signed in", and conflating
			 * them signs people out at random — a restarting API in development, a
			 * cold start in production, one dropped connection. They then sign in
			 * successfully, come back, and meet the next blip identically.
			 *
			 * A clean refusal goes to sign-in at once. A failure to ask is retried
			 * before concluding anything.
			 */
			// ⚠️ Backoff spanning ~6 seconds, not one 600ms retry. A development
			// server restarting, or a cold serverless start, routinely takes several
			// seconds — a retry that gives up sooner than the server takes to return
			// is the same bug with extra steps, which is exactly what the first
			// attempt at this fix shipped.
			for (const wait of [0, 400, 1200, 2200, 2500]) {
				if (wait > 0) {
					await new Promise((resolve) => setTimeout(resolve, wait));
				}
				try {
					const { data } = await authClient.getSession();
					if (data?.session && data.user) authenticated = { user: data.user };
					// A clean answer either way. Retrying cannot change it.
					break;
				} catch {
					// Could not ask. Retry once, then give up.
				}
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
		// The same mark QuickDash shows while a route resolves. The two consoles
		// share their chrome, so they share this too.
		pendingComponent: SkeletonScreen,
	},
);

function RootLayout() {
	return <AccountShell />;
}

function AccountShell() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	// Onboarding and invitation joining only. Both happen before somebody has an
	// account to frame, so the console would be chrome around nothing.
	//
	// ⚠️ Billing used to be excluded too, from when it was a full-page flow. That
	// meant paying for the product dropped you out of the product — no sidebar, no
	// way back except the browser's own button.
	const outsideConsole =
		pathname === "/onboarding" ||
		// The onboarding redesign, reviewed before it replaces the live flow.
		pathname === "/onboarding-preview" ||
		pathname.startsWith("/join/");
	if (outsideConsole) return <Outlet />;
	return <AccountConsole />;
}

/**
 * Account's own links inside the shared shell.
 *
 * Everything the sidebar and the account popover point at lives in THIS app, so
 * they must be router links. As plain anchors they reloaded the document, which
 * is why the sidebar appeared to flash and rebuild on every click. QuickDash
 * renders the same menu without this, because there those targets really are on
 * another origin.
 */
const AccountLink: ConsoleLink = ({ href, className, children }) => (
	<Link to={href} className={className}>
		{children}
	</Link>
);

function AccountConsole() {
	const [searchOpen, setSearchOpen] = useState(false);
	const [feedbackOpen, setFeedbackOpen] = useState(false);
	const [sidebarContext, setSidebarContext] = useState<
		"navigation" | "notifications"
	>("navigation");
	const { user } = Route.useRouteContext();
	const queryClient = useQueryClient();
	const { organizations, active } = useActiveOrganization();
	const plan = useQuery(accountQueries.plan(active?.id ?? ""));
	const notifications = useQuery(accountQueries.notifications());

	return (
		<ConsoleShell
			switcher={
				<SidebarName
					name={active?.name ?? ""}
					currentId={active?.id ?? ""}
					items={organizations.data?.items ?? []}
					onSelect={(organizationId) => {
						activeOrganization.write(organizationId);
						queryClient.setQueryData(
							["account", "activeOrganization"],
							organizationId,
						);
					}}
					searchLabel="Find organization"
					createLabel="Create organization"
					createHref="/organizations/new"
					link={AccountLink}
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
					<AccountNotifications
						items={notifications.data?.items ?? []}
						unread={notifications.data?.unread ?? 0}
					/>
				) : (
					<AccountNav />
				)
			}
			account={
				<SidebarAccount
					name={user.name ?? ""}
					planId={plan.data?.planId ?? null}
					accountUrl=""
					authUrl={clientEnv.AUTH_URL}
					webUrl={clientEnv.WEB_URL}
					link={AccountLink}
					onFeedback={() => setFeedbackOpen(true)}
				/>
			}
			overlays={
				<>
					<AccountSearch open={searchOpen} onOpenChange={setSearchOpen} />
					<FeedbackDialog
						open={feedbackOpen}
						onOpenChange={setFeedbackOpen}
						name={user.name ?? user.email}
						email={user.email}
					/>
				</>
			}
		>
			<Outlet />
		</ConsoleShell>
	);
}

// 🔴 The status screens moved to `components/status-screens.tsx` on 2026-08-11
// because they have to know WHICH CONTEXT they are in. This app holds both
// onboarding and the account, and an error during onboarding must not offer to
// send somebody to an account that does not exist yet, or render dashboard
// chrome for a product they have not finished creating.
//
// They also used `StatusScreen` and `RequestErrorScreen` from `@quickengine/ui`,
// which are the pre-redesign components — the same ones the marketing and auth
// apps stopped using. An error screen is the worst possible moment to look like
// a different product.
