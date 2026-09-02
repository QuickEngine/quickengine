import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { resolveSession } from "@quickengine/auth/session";
import {
	ConsoleAssistant,
	ConsoleBell,
	type ConsoleLink,
	ConsoleShell,
	ConsoleTheme,
	MobileNotice,
	SidebarAccount,
	SidebarName,
	ThemeProvider,
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
import { AccountNav, pageTitle } from "../components/account-nav";
import { AccountNotifications } from "../components/account-notifications";
import { AccountSearch } from "../components/account-search";
import { AssistantPanel } from "../components/assistant-panel";
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
				/**
				 * 🔴 `resolveSession` separates "no session" from "could not ask",
				 * and caches briefly. Calling Better Auth on every navigation
				 * exceeded its 100-per-minute limit during ordinary clicking, and
				 * the 429 that came back was indistinguishable from a sign-out —
				 * so browsing the console threw people to the login page.
				 */
				const session = await resolveSession();
				if (session.status === "signed-in") {
					authenticated = { user: session.user };
					break;
				}
				// A definite "no session". Retrying cannot change it.
				if (session.status === "signed-out") break;
				// `unknown` — nobody answered usefully. Try again.
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
	/**
	 * 🔴 `ThemeProvider` was NEVER MOUNTED in this app.
	 *
	 * `useTheme()` falls back to the context default — `{ theme: "dark", setTheme:
	 * () => {} }` — so every theme control in Account was calling a no-op. It did
	 * not fail, it did nothing, which is why it read as a styling problem rather
	 * than a missing provider. Only `apps/quickengine/web` had ever mounted one.
	 *
	 * ⚠️ ABOVE the onboarding branch, not inside the console. Onboarding renders
	 * outside `AccountConsole`, so a provider mounted in there would leave the one
	 * screen that offers the choice unable to make it.
	 */
	return (
		<ThemeProvider>
			<AccountShell />
			{/* Every surface was designed at desktop width first, and the small
			    screen passes have not been done. Saying so is the difference between
			    a product under construction and one that looks broken. */}
			<MobileNotice />
		</ThemeProvider>
	);
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
	// The shell's own `AccountShell` already reads this to decide whether to draw
	// the console at all; the header needs it to say which page you are on.
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const [searchOpen, setSearchOpen] = useState(false);
	const [assistantOpen, setAssistantOpen] = useState(false);
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
			/**
			 * 🔴 THREE ZONES, as a grid rather than a flex row.
			 *
			 * The search has to be centred on the WINDOW, not on whatever space the
			 * breadcrumb leaves behind. In a flex row it drifts left and right as page
			 * names change length, which is the sort of movement nobody can name but
			 * everybody feels. `grid-cols-3` gives the middle column a fixed centre
			 * and lets the two sides be whatever width they need.
			 *
			 * ⚠️ `justify-self` on the outer two, so they hug their own edges instead
			 * of centring inside their columns.
			 */
			header={
				<div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3">
					{/* 🔑 The switcher and the bell together on the left. Both are about
					    the ORGANISATION you are in rather than the page you are on, and
					    the sidebar no longer has a header row for them to live in. */}
					{/* 🔴 Exactly as wide as the SIDEBAR, and it tracks the drag.
					    `--console-rail` is set on the frame by the resizer, so this group
					    tracks the rail at every width.
					    ⚠️ `- 16px` is the sidebar nav's own `px-2` on BOTH sides. The
					    group is matched to the nav BUTTONS, not to the panel: the header's
					    `px-2` already puts its left edge on theirs, and subtracting the
					    nav's other 8px puts the bell's right edge on theirs too.
					    The bell is `shrink-0`, so the switcher absorbs every pixel of a
					    drag and the name elides rather than the bell moving. */}
					<div
						style={{ width: "calc(var(--console-rail, 240px) - 16px)" }}
						className="flex min-w-0 items-center gap-1.5 justify-self-start"
					>
						<SidebarName
							compact
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
						/>
						<ConsoleBell
							count={notifications.data?.unread ?? 0}
							active={sidebarContext === "notifications"}
							onClick={() =>
								setSidebarContext((current) =>
									current === "notifications" ? "navigation" : "notifications",
								)
							}
						/>
					</div>

					{/* 🔑 It says its shortcut. A magnifying glass alone teaches nobody
					    that ⌘K exists, and ⌘K is how anybody using this daily will
					    actually open it.
					    ⚠️ `rounded-md`, not a pill: it is a field, and a field shaped
					    like a button reads as one. */}
					<button
						type="button"
						onClick={() => setSearchOpen(true)}
						style={{
							boxShadow: "var(--control-raise)",
							backgroundImage: "var(--control-face)",
						}}
						className="flex h-9 w-[min(24rem,34vw)] items-center gap-2 rounded-md border border-[var(--console-line)] bg-[var(--console-panel)] px-2.5 text-[12px] text-[var(--ink-35)] transition-[box-shadow,color] duration-150 hover:text-[var(--ink-70)] hover:shadow-[var(--control-raise-hover)] active:translate-y-px"
					>
						<MagnifyingGlassIcon size={13} className="shrink-0" />
						<span className="min-w-0 flex-1 truncate text-left">Search</span>
						<span className="shrink-0 text-[10px] text-[var(--ink-25)]">
							⌘K
						</span>
					</button>

					{/* 🔴 The account control lives HERE now, not at the foot of the
					    sidebar. Top-right is where every console puts it, and the
					    sidebar's last row is prime space that navigation should have. */}
					<div className="flex items-center gap-1.5 justify-self-end">
						{/* 🔑 Both shared, so the two consoles cannot drift apart on
						    controls that are meant to be identical. */}
						<ConsoleTheme />
						<ConsoleAssistant
							open={assistantOpen}
							onClick={() => setAssistantOpen((open) => !open)}
						/>
						<SidebarAccount
							compact
							name={user.name ?? ""}
							email={user.email ?? ""}
							planId={plan.data?.planId ?? null}
							accountUrl=""
							authUrl={clientEnv.AUTH_URL}
							link={AccountLink}
							onFeedback={() => setFeedbackOpen(true)}
						/>
					</div>
				</div>
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
			/**
			 * 🔑 Account's pages are settings and lists, not dashboards of tables —
			 * six of them already cap themselves at `max-w-2xl`. Capping the column
			 * itself means resizing the sidebar or opening the assistant moves the
			 * GUTTERS rather than reflowing the page, which is the difference between
			 * a layout that adjusts and one that visibly stretches.
			 */
			contentMax="72rem"
			breadcrumb={
				<h1 className="truncate text-[15px] text-[var(--ink-90)]">
					{pageTitle(pathname)}
				</h1>
			}
			assistantOpen={assistantOpen}
			assistant={<AssistantPanel onClose={() => setAssistantOpen(false)} />}
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
