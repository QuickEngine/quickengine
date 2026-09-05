import {
	GearSixIcon,
	MagnifyingGlassIcon,
	SidebarSimpleIcon,
} from "@phosphor-icons/react";
import { authClient } from "@quickengine/auth/client";
import {
	ConsoleAssistant,
	ConsoleBell,
	ConsoleShell,
	ConsoleTools,
	SidebarAccount,
	SidebarName,
} from "@quickengine/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { type MouseEventHandler, useCallback, useState } from "react";
import { AssistantPanel } from "../components/assistant-panel";
import { ConnectionBanner } from "../components/connection-banner";
import { ConsoleGlow } from "../components/console-glow";
import { DevConsole } from "../components/dev-console";
import { FeedbackDialog } from "../components/feedback-dialog";
import { HeaderActionProvider } from "../components/header-action";
import { NotificationToasts } from "../components/notification-toasts";
import { QuickActions } from "../components/quick-actions";
import { QuickToolsPanel } from "../components/quicktools-panel";
import { SettingsNav } from "../components/settings/settings-nav";
import { SidebarCard } from "../components/sidebar-card";
import { StorefrontActions } from "../components/storefront-button";
import {
	helpWasOpen,
	rememberHelpOpen,
	SupportBubble,
} from "../components/support-bubble";
import { WorkspaceBreadcrumb } from "../components/workspace-breadcrumb";
import { WorkspaceChats } from "../components/workspace-chats";
import { WorkspaceNav } from "../components/workspace-nav";
import { WorkspaceNotifications } from "../components/workspace-notifications";
import { WorkspaceSearch } from "../components/workspace-search";
import { sessionApi, workspaceApi } from "../lib/api";
import { AssistantProvider } from "../lib/assistant";
import { DevConsoleProvider } from "../lib/dev-console";
import { clientEnv } from "../lib/env";
import {
	clearNativeToken,
	isNativeShell,
	nativeAuthHeaders,
} from "../lib/native-auth";
import { navSignals, withCount } from "../lib/nav-signals";
import { quickDashQueries } from "../lib/quickdash-api";

function WorkspaceShell() {
	return (
		<HeaderActionProvider>
			<WorkspaceFrame />
		</HeaderActionProvider>
	);
}

function WorkspaceFrame() {
	const { workspace } = Route.useParams();
	const { user, workspaceId } = Route.useRouteContext();
	const context = useQuery(quickDashQueries.context(workspaceId));
	const plan = useQuery(
		quickDashQueries.plan(context.data?.workspace.organizationId),
	);
	const notifications = useQuery(quickDashQueries.notifications(workspaceId));
	/**
	 * 🔴 Scoped to the workspace on screen.
	 *
	 * The inbox is per PERSON — `notifications` carries a `user_id` and no
	 * workspace at all — so every workspace showed every other workspace's
	 * notices. Two businesses run by one person read each other's mail, and the
	 * counts on the bell described work that was not here.
	 *
	 * ⚠️ Filtered on the href's own first segment, which is the workspace the
	 * notice actually points at. Anything without an href cannot be attributed
	 * and is left in: dropping it would hide it everywhere rather than somewhere.
	 */
	const workspaceNotices = (notifications.data?.items ?? []).filter((item) => {
		if (!item.href) return true;
		const [owner] = item.href.replace(/^\/+/, "").split("/");
		return owner === workspaceId || owner === context.data?.workspace.slug;
	});
	// 🔴 Counted from the SCOPED list, not the server's organization-wide total.
	// Otherwise the bell reads "3" over a panel showing nothing, and the number
	// somebody is chasing belongs to a different business.
	const workspaceUnread = workspaceNotices.filter(
		(item) => !item.readAt,
	).length;
	/**
	 * Has anything ever called this workspace?
	 *
	 * 🔑 The SAME query key the Connect page uses, so this shares its cache
	 * rather than issuing a second request, and both agree on the answer. Polls
	 * only while nothing has called — once a key has been used the answer can
	 * never revert.
	 */
	const organizationId = context.data?.workspace.organizationId ?? "";

	/**
	 * The quick switch between rehearsal and real money.
	 *
	 * 🔴 The SAME endpoint the settings page uses, not a second path to the same
	 * state. The mode locks once the workspace has a payment account, an order or
	 * a payment, and that rule lives in the API — so this can be refused, and the
	 * refusal is the interesting case. Its message is the rule, which is why it
	 * is surfaced verbatim rather than replaced with something generic.
	 */
	const queryClient = useQueryClient();
	const [environmentError, setEnvironmentError] = useState<string | null>(null);
	const switchEnvironment = useMutation({
		mutationFn: (environment: "test" | "live") =>
			sessionApi.request(
				`/account/workspaces/${workspaceId}/environment?organizationId=${encodeURIComponent(organizationId)}`,
				{ method: "PATCH", body: { environment } },
			),
		onSuccess: () => {
			setEnvironmentError(null);
			void queryClient.invalidateQueries({
				queryKey: ["quickdash", workspaceId, "context"],
			});
		},
		onError: (error: { message?: string }) =>
			setEnvironmentError(
				error?.message ??
					"That could not be changed. This workspace has already taken payments.",
			),
	});
	const keys = useQuery({
		queryKey: ["quickdash", workspaceId, "api-keys"],
		queryFn: async () =>
			(
				await sessionApi.request<{
					items: Array<{ lastUsedAt: string | null; revokedAt: string | null }>;
				}>(
					`/account/api-keys?workspaceId=${encodeURIComponent(workspaceId)}&organizationId=${encodeURIComponent(organizationId)}`,
				)
			).data,
		/**
		 * 🔴 `organizationId` is REQUIRED by `authorizeAccount`, not optional.
		 *
		 * Every account route resolves the caller's access through the
		 * organization, so a request without it is refused with a 400 before the
		 * handler runs. Both callers sent only `workspaceId` and both were
		 * failing silently into the console — which is also why the storefront
		 * key never appeared on the Connect page.
		 */
		enabled: workspaceId.length > 0 && organizationId.length > 0,
		placeholderData: (previous) => previous,
		/**
		 * 🔴 Deliberately NOT polled here.
		 *
		 * This used to refetch every 15 seconds whenever no key had been used —
		 * which includes a workspace with no keys at all. That is the common case
		 * for a new workspace, so the layout route, which is mounted on every
		 * page, asked the API the same question four times a minute for the whole
		 * session. Worse, it was asking to compute `connectPending`, and that flag
		 * requires `liveKeys.length > 0`, so in the state that triggered the
		 * polling the answer was already known to be false.
		 *
		 * The Connect page keeps its poll: somebody sitting there is mid-setup and
		 * watching it turn over. Both observers share this query key, so while
		 * that page is open the sidebar gets the fresh answer for free.
		 */
		staleTime: 5 * 60_000,
	});
	/**
	 * Customers waiting on a reply.
	 *
	 * 🔑 Shown on the row rather than only inside Messages, because an unread
	 * message is the one thing in this console where somebody else is waiting on
	 * a human. Everything else can sit; a person cannot.
	 *
	 * Counted from the same list the Messages page reads, so the dot and the page
	 * can never disagree.
	 */
	const conversations = useQuery({
		queryKey: ["quickdash", workspaceId, "conversations"],
		queryFn: async () =>
			(
				await workspaceApi(workspaceId).request<{
					items: Array<{ unreadForOperator?: number }>;
				}>("/customer-conversations")
			).data,
		refetchInterval: 60_000,
	});
	const unreadMessages = (conversations.data?.items ?? []).reduce(
		(total, item) => total + (item.unreadForOperator ?? 0),
		0,
	);

	const liveKeys = (keys.data?.items ?? []).filter((key) => !key.revokedAt);
	// Waiting only counts once a key EXISTS. A workspace with no keys has not
	// started connecting, so a spinner there would be waiting on nothing.
	const connectPending =
		liveKeys.length > 0 && liveKeys.every((key) => !key.lastUsedAt);
	const [searchOpen, setSearchOpen] = useState(false);
	const [feedbackOpen, setFeedbackOpen] = useState(false);
	const [assistantOpen, setAssistantOpen] = useState(false);
	/**
	 * Whether the settings rail is showing, and which section it should mark.
	 *
	 * ⚠️ Read from the router rather than from a param hook: this is the LAYOUT,
	 * so it is mounted for every child route and `useParams` for a child's
	 * parameter is not available here.
	 */
	/**
	 * Whether the navigation rail is showing.
	 *
	 * 🔴 Held HERE, beside the button that toggles it, and handed to the shell.
	 * It lived inside `ConsoleShell` behind a context, and this component renders
	 * that shell rather than living inside it — so the hook returned the default
	 * and the setter was a no-op. The button worked perfectly and changed
	 * nothing.
	 *
	 * ⚠️ Remembered, and read on the first render rather than in an effect: a
	 * sidebar that appears and then vanishes a frame later is worse than one that
	 * starts closed.
	 */
	const [railOpen, setRailOpenState] = useState(() => {
		try {
			return localStorage.getItem(RAIL_OPEN_KEY) !== "closed";
		} catch {
			return true;
		}
	});
	const setRailOpen = useCallback((value: boolean) => {
		setRailOpenState(value);
		try {
			localStorage.setItem(RAIL_OPEN_KEY, value ? "open" : "closed");
		} catch {
			// Storage disabled. It simply will not be remembered.
		}
	}, []);
	/* The button only exists in the desktop app. See the note on it. */
	const shell = isNativeShell();

	const settingsPath = useRouterState({
		select: (state) => state.location.pathname,
	});
	const inSettings = settingsPath.includes("/settings");
	const settingsSection = inSettings
		? (settingsPath.split("/settings/")[1]?.split("/")[0] ?? undefined)
		: undefined;
	const [toolsOpen, setToolsOpen] = useState(false);
	const [consoleOpen, setConsoleOpen] = useState(false);
	// Summoned, and remembered for the session so navigating does not close it.
	// Becomes a chat window, and a chat that shuts on every page change is not
	// a conversation.
	const [helpOpen, setHelpOpen] = useState(helpWasOpen);

	const showHelp = (open: boolean) => {
		setHelpOpen(open);
		rememberHelpOpen(open);
	};
	// The bell swaps what the sidebar's navigation slot renders rather than
	// opening a popover over it — same pattern as Account, so the two consoles
	// behave identically.
	const [sidebarContext, setSidebarContext] = useState<
		"navigation" | "notifications" | "chats"
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
		/* 🔴 Wraps the WHOLE shell, not the panel. The conversation list is in the
		   sidebar and the conversation is in the right hand column, so the state
		   has to sit above both or the two lists start disagreeing about which
		   chat is open. */
		<AssistantProvider workspaceId={workspaceId}>
			<ConsoleGlow />
			<ConsoleShell
				/**
				 * 🔴 No page header, deliberately.
				 *
				 * It carried a page title, a breadcrumb and one button. The sidebar
				 * already says which page you are on, the create button now sits with
				 * the search and view toggle it belongs beside, and a breadcrumb two
				 * levels deep is a line of chrome above every screen restating what the
				 * screen is.
				 *
				 * ⚠️ `WorkspaceHeader` is left on disk and still takes `crumb`. The open
				 * record's name has nowhere to go now, and putting it back somewhere
				 * sensible is a design decision rather than a deletion — so the
				 * component stays ready rather than needing to be rebuilt.
				 */
				/**
				 * 🔴 The same three zones Account uses: the organisation on the left, the
				 * search centred on the WINDOW, and the things that act on you or for you
				 * on the right. It was `header={null}` — the slot existed and nothing was
				 * ever put in it.
				 *
				 * ⚠️ Three columns, not a flex row. The search has to be
				 * 🔴 The middle is `minmax(0, 24rem)` rather than `auto`. An `auto`
				 * column is sized to its content and never gives way, so once the
				 * window was narrow — a half screen tile is 756 points — the right
				 * hand group ran out of room and was drawn straight OVER the search:
				 * the create button sat on top of the ⌘K hint. A minmax column takes
				 * up to 24rem and yields below it, so the search narrows instead.
				 * centred on the window rather than on whatever space the left group
				 * leaves, or it drifts every time a workspace name changes length.
				 */
				header={
					/* 🔴 Draggable, like the card around it. `data-tauri-drag-region`
					   matches the element the event actually lands on and does NOT walk
					   up the tree, and this grid covers the whole header — so with the
					   attribute only on the card, nothing but a few pixels of padding
					   was ever draggable and the window could not be moved. The gaps
					   and empty columns belong to this element, so it needs it too. */
					<div
						data-tauri-drag-region
						/* 🔴 An inline style, not a Tailwind arbitrary class.
						   `grid-cols-[1fr_minmax(0,24rem)_1fr]` produced no CSS at all:
						   the value contains a comma inside brackets, the scanner did not
						   emit a rule for it, and the class silently did nothing — the
						   header looked untouched and the search kept being overlapped.
						   A style attribute cannot fail quietly. */
						/* 🔴 The outer columns have a FLOOR of their own content.
						   Plain `1fr` splits the leftover evenly whatever the content
						   needs, so at half screen each side got about 206px while the
						   right hand group needs nearer 300 — and a grid item does not
						   shrink to fit, it overflows. Pinned to the right by
						   `justify-self-end`, it overflowed leftward and was drawn on top
						   of the search box.
						   `minmax(max-content, 1fr)` says: never narrower than what is in
						   you, and share anything spare equally. The search keeps the
						   middle and gives way first, which is the right order — it is
						   the one control here that is still usable at half the size. */
						style={{
							gridTemplateColumns:
								"minmax(max-content, 1fr) minmax(0, 24rem) minmax(max-content, 1fr)",
						}}
						className="grid min-w-0 flex-1 items-center gap-3"
					>
						{/* 🔴 FIXED, and deliberately no longer tracking the drag.
					    224px is the sidebar at its narrowest (240px) less the nav's own
					    `px-2` on both sides, so at the default width the switcher still
					    lines up exactly with the buttons below it.
					    ⚠️ It used to follow `--console-rail`. Widening the sidebar for
					    more room in the NAVIGATION then stretched a header control that
					    had no reason to grow — a workspace name does not get longer
					    because you dragged a divider, so the extra width was empty. */}
						<div
							style={{ width: "224px" }}
							data-tauri-drag-region
							className="flex min-w-0 items-center gap-1.5 justify-self-start"
						>
							<SidebarName
								compact
								name={context.data?.workspace.name ?? ""}
								// 🔴 Test mode is otherwise invisible, which is how a real card
								// gets taken in a test workspace — or a test card in the live one.
								/* ⚠️ Test wins over Closed when both are true. A test
								   workspace's shop being shut is not news; a LIVE one's is,
								   and that is the case the badge exists for. */
								badge={
									context.data?.workspace.environment === "test"
										? "Test"
										: context.data?.workspace.published === false
											? "Closed"
											: null
								}
								currentId={context.data?.workspace.id ?? ""}
								items={(context.data?.workspaces ?? []).map((item) => ({
									id: item.id,
									name: item.name,
									badge: item.environment === "test" ? "Test" : null,
								}))}
								onSelect={(chosen) => {
									// Navigate by slug where there is one, so the address bar keeps
									// reading as the business rather than as an internal id.
									const target = (context.data?.workspaces ?? []).find(
										(entry) => entry.id === chosen,
									);
									window.location.assign(`/${target?.slug ?? chosen}`);
								}}
								actions={
									<>
										<Link
											to="/$workspace/settings/$section"
											params={{ workspace, section: "general" }}
											className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[12px] text-[var(--ink-55)] no-underline outline-none transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-90)]"
										>
											<GearSixIcon size={16} className="shrink-0" />
											Workspace settings
										</Link>
										<StorefrontActions
											workspaceId={workspaceId}
											organizationId={context.data?.workspace.organizationId}
											published={context.data?.workspace.published ?? true}
										/>
									</>
								}
								searchLabel="Find workspace"
								createLabel="Create workspace"
								createHref={`${clientEnv.ACCOUNT_URL}/workspaces/new`}
								environment={context.data?.workspace.environment}
								onEnvironment={(next) => switchEnvironment.mutate(next)}
								busy={switchEnvironment.isPending}
								environmentError={environmentError}
							/>
							<ConsoleBell
								count={workspaceUnread}
								active={sidebarContext === "notifications"}
								/* 🔴 Closing notifications returns to what the sidebar was
								   SHOWING, not to navigation. With the assistant open the
								   sidebar is the chat list, and hardcoding the way back meant
								   the bell quietly closed the assistant's list behind it: you
								   pressed the bell twice and your chats were gone, with no
								   way back except closing and reopening the whole panel. The
								   base context is whatever the shell is currently in. */
								onClick={() =>
									setSidebarContext((current) =>
										current === "notifications"
											? assistantOpen
												? "chats"
												: "navigation"
											: "notifications",
									)
								}
							/>
							{/*
							 * 🔴 Desktop only, and it is the shell that makes it earn its
							 * place. In a browser a window is one tab of twenty and the
							 * sidebar is the map; in an app snapped to half a screen it is
							 * a third of everything you can see, and being able to put it
							 * away is the difference between the window being usable at
							 * that size and not.
							 *
							 * ⚠️ Always present rather than only while the rail is open.
							 * Hiding the control that reopens a hidden panel leaves no way
							 * back to it, and a person who collapsed the sidebar by accident
							 * would have to find their way through localStorage. It says
							 * which state pressing it produces instead.
							 */}
							{shell ? (
								<button
									type="button"
									aria-pressed={railOpen}
									data-hint={railOpen ? "Hide the sidebar" : "Show the sidebar"}
									aria-label={
										railOpen ? "Hide the sidebar" : "Show the sidebar"
									}
									onClick={() => setRailOpen(!railOpen)}
									className={`control-raised flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--console-line)] outline-none ${
										railOpen
											? "text-[var(--ink-40)] hover:text-[var(--ink-90)]"
											: "text-[var(--ink-90)]"
									}`}
								>
									<SidebarSimpleIcon size={16} />
								</button>
							) : null}
						</div>

						<button
							type="button"
							onClick={() => setSearchOpen(true)}
							style={{}}
							/* `w-full` inside a column that already caps at 24rem: the width
							   belongs to the grid, which is the only thing that knows how
							   much room the other two columns need. */
							className="control-raised flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-[var(--console-line)] px-2.5 text-[12px] text-[var(--ink-35)] hover:text-[var(--ink-70)]"
						>
							<MagnifyingGlassIcon size={13} className="shrink-0" />
							<span className="min-w-0 flex-1 truncate text-left">Search</span>
							<span className="shrink-0 text-[10px] text-[var(--ink-25)]">
								⌘K
							</span>
						</button>

						{/* 🔑 Three controls, and every one of them OPENS A SURFACE over
						    the page you are on. That is the whole rule now.

						    🔴 It was eight, and they were eight different kinds of thing:
						    a link out of the product, two panel toggles, a developer
						    tool, a cycling preference, and your account. Nothing about
						    the group said what pressing anything would do, so it read as
						    a row of icons to be memorised.

						    Three moved to where they actually belong: the storefront to
						    the workspace group on the left, integrations into Settings
						    beside every other thing you configure, and the developer
						    console onto the Developers page. None were deleted; each
						    went to the place it was already a member of. The theme
						    switch is the deliberate exception, for the reason on it
						    below. */}
						<div
							data-tauri-drag-region
							/* `min-w-0` so the account button inside can truncate instead
							   of the whole group being clipped by the header's edge. */
							className="flex min-w-0 items-center gap-1.5 justify-self-end"
						>
							{/* Starting something new sits with the things that OPEN a
						    surface, at the head of the group. */}
							<QuickActions
								workspace={workspace}
								modules={context.data?.modules ?? []}
							/>
							{/* QuickTools is about this workspace, the assistant is about
						    the page. */}
							<ConsoleTools
								open={toolsOpen}
								onClick={() => setToolsOpen((open) => !open)}
							/>
							{/* Nothing to arbitrate with any more: integrations left the
							    right column for Settings, so the assistant owns it. */}
							{/* 🔑 Opening the assistant brings its chats into the sidebar,
							    and closing it puts the navigation back. The two are one
							    surface in two columns, so they arrive and leave together;
							    leaving a list of chats beside a closed panel is a sidebar
							    pointing at nothing. */}
							<ConsoleAssistant
								open={assistantOpen}
								onClick={() =>
									setAssistantOpen((open) => {
										setSidebarContext(open ? "navigation" : "chats");
										return !open;
									})
								}
							/>
							<SidebarAccount
								compact
								name={user.name ?? ""}
								email={user.email ?? ""}
								planId={plan.data?.planId ?? null}
								accountUrl={clientEnv.ACCOUNT_URL}
								authUrl={clientEnv.AUTH_URL}
								/* 🔴 No `settingsHref`, so this row falls back to the ACCOUNT's
								   own settings, which is what it should always have meant.
								   This menu is about the person: their account, their plan,
								   signing out. The WORKSPACE's settings live in the workspace
								   switcher, the one surface already scoped to one workspace.
								   Pointing this row at them made "Settings" mean two different
								   objects depending on which console you were in. */
								/* 🔴 No Settings row. QuickDash has its own, in the workspace
								   switcher; this menu is about the person. See `showSettings`. */
								showSettings={false}
								onSignOut={nativeSignOut}
								onFeedback={() => setFeedbackOpen(true)}
								onHelp={() => showHelp(true)}
							/>
						</div>
					</div>
				}
				// Driven by the workspace's own environment, so it cannot disagree with
				// what the API will actually do with a payment.
				/**
				 * ⚠️ The band is EMPTY now and still rendered. Its only job is height:
				 * that height is what makes the frame round its top corners and sit
				 * inside the window, which is the geometry that says "sandbox" before any
				 * colour is read. The floor behind the panels carries the colour.
				 *
				 * 🔴 The Go live button went with the copy. Switching mode now lives in
				 * the workspace switcher, where somebody already goes to change which
				 * workspace they are in — one place that answers "which workspace, and
				 * which mode", rather than a control stranded on a band.
				 */
				// 🔴 A theme, not a band. Sandbox re-colours every surface instead of
				// adding a strip — entering it used to change the console's height.
				breadcrumb={
					<WorkspaceBreadcrumb
						workspace={workspace}
						modules={context.data?.modules ?? []}
					/>
				}
				nav={
					/* 🔴 A third context, not a fourth column. Chats are a LIST, and
					   the sidebar is where this console keeps lists: it already swaps
					   between navigation and notifications, so conversations behave the
					   way those two do rather than inventing their own place. */
					/* 🔴 SETTINGS IS A SIDEBAR CONTEXT, and it is driven by the ROUTE
					   rather than by a piece of state.
					   Settings used to be a dialog laid over the console. It is now a
					   place, so the thing that decides whether its list is showing is
					   the address you are at: arriving by link, reloading, or walking
					   back out with the browser's button all put the rail in the right
					   state without anything having to remember to set it.
					   ⚠️ It wins over the other two on purpose. Opening notifications
					   while inside settings would leave you looking at a section with
					   no way back to its list. */
					inSettings ? (
						<SettingsNav
							workspace={workspace}
							modules={context.data?.modules ?? []}
							active={settingsSection}
						/>
					) : sidebarContext === "chats" ? (
						<WorkspaceChats />
					) : sidebarContext === "notifications" ? (
						<WorkspaceNotifications
							items={workspaceNotices}
							unread={workspaceUnread}
						/>
					) : (
						<WorkspaceNav
							// The nav builds LINKS, so it takes the URL segment — the slug —
							// while everything that runs a query takes the resolved id.
							// Passing the id here would put uuids back in every address.
							workspaceId={workspace}
							modules={context.data?.modules ?? []}
							connectPending={connectPending}
							// 🔑 The dots come from the SAME unread notifications the bell
							// counts, routed by each notification's own href — so a dispute
							// lights Payments, a sale lights Orders, and a flagged shipment
							// lights Shipping, with no per-event wiring. Unread messages are
							// merged in from the conversation list, which knows about
							// messages the bell was never told about.
							childBadges={withCount(
								navSignals(workspaceNotices, {
									id: workspaceId,
									slug: context.data?.workspace.slug,
								}),
								"client-records/messages",
								unreadMessages,
							)}
						/>
					)
				}
				// Between the navigation and the account row: seen, never in the way.
				navBottom={
					<SidebarCard
						workspaceId={workspaceId}
						usage={plan.data?.usage}
						/**
						 * 🔑 The SAME next step Home shows, derived the same way. Two
						 * surfaces computing "what should I do next" separately is two
						 * surfaces that will eventually disagree in front of a customer.
						 */
						nextStep={
							context.data?.checklist.dismissed
								? null
								: (context.data?.checklist.items ?? [])
										.flatMap((goal) => goal.steps)
										.find((step) => step.isNext)
						}
					/>
				}
				/**
				 * 🔑 Workspace AND environment. A sandbox and a live workspace are
				 * different places to work even when they share an id, so the tool bar
				 * they each want is different too — and scoping to the id alone would let
				 * a rehearsal decide the layout of the real one.
				 */
				scope={`${workspaceId}:${context.data?.workspace.environment ?? "live"}`}
				toolsOpen={toolsOpen}
				tools={<QuickToolsPanel />}
				assistantOpen={assistantOpen}
				railOpen={railOpen}
				bottomOpen={consoleOpen}
				bottom={<DevConsole workspaceId={workspaceId} />}
				assistant={<AssistantPanel />}
				overlays={
					<>
						{/* 🔑 In `overlays`, so it outlives every page. Connectivity is a
					    property of the WINDOW — remounting it per route would make it
					    vanish and reappear on navigation, which is the one moment it
					    most needs to stay put. */}
						<ConnectionBanner />
						<WorkspaceSearch
							open={searchOpen}
							onOpenChange={setSearchOpen}
							workspaceId={workspaceId}
							workspace={workspace}
							modules={context.data?.modules ?? []}
						/>
						<FeedbackDialog
							open={feedbackOpen}
							onOpenChange={setFeedbackOpen}
							name={user.name ?? ""}
							email={user.email ?? ""}
							workspaceName={context.data?.workspace.name}
						/>
						<SupportBubble
							open={helpOpen}
							onClose={() => showHelp(false)}
							workspaceName={context.data?.workspace.name}
						/>
						{/* Reads the same list the bell does, so a toast is only ever a
					    preview of a row that is already durable. */}
						<NotificationToasts items={notifications.data?.items} />
					</>
				}
			>
				{/* The Developers page opens the console strip; see `useDevConsole`. */}
				<DevConsoleProvider open={consoleOpen} setOpen={setConsoleOpen}>
					<Outlet />
				</DevConsoleProvider>
			</ConsoleShell>
		</AssistantProvider>
	);
}

/** Whether the rail is showing at all, as opposed to how wide it is. */
const RAIL_OPEN_KEY = "quickengine-console-rail-open";

export const Route = createFileRoute("/$workspace")({
	/**
	 * The URL says `/caffeinate`, the API needs a uuid.
	 *
	 * 🔑 A workspace id is an internal identifier, and putting it in the address
	 * bar made every link a business shares — or pastes into a support chat —
	 * carry it. A slug reads as their own name and gives nothing away.
	 *
	 * 🔴 Resolved ONCE here rather than in each page, so no page can disagree
	 * with another about which workspace it is showing. The result goes into
	 * route context, which every child inherits.
	 *
	 * ⚠️ A uuid still resolves to itself. Old links keep working, and a workspace
	 * whose slug was never set — one created before slugs, or by hand — is still
	 * reachable rather than becoming a 404.
	 */
	beforeLoad: async ({ context, params }) => {
		const key = params.workspace;
		if (UUID.test(key)) return { workspaceId: key };
		/**
		 * 🔴 NEVER throws.
		 *
		 * A throw here happens ABOVE the shell, so it hits the root boundary and
		 * replaces the entire console — sidebar, header and search — for a
		 * failure that belongs on one page. This lookup only turns a slug into an
		 * id; if it cannot, falling through with the slug lets the shell render
		 * and the page report the failure inside the outlet, where you can still
		 * navigate away from it.
		 *
		 * ⚠️ Unmatched also falls through as-is: the API answers 404 for a
		 * workspace that does not exist, which is the honest error rather than a
		 * redirect that hides a typo.
		 */
		try {
			const workspaces = await context.queryClient.ensureQueryData(
				quickDashQueries.workspaces(),
			);
			const match = workspaces.items.find(
				(workspace) => workspace.slug === key || workspace.id === key,
			);
			return { workspaceId: match?.id ?? key };
		} catch {
			return { workspaceId: key };
		}
	},
	component: WorkspaceShell,
});

/** Cheap enough to test before spending a network round trip on a lookup. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
