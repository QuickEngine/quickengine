import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { authClient } from "@quickengine/auth/client";
import {
	ConsoleAssistant,
	ConsoleBell,
	ConsoleIntegrations,
	ConsoleShell,
	ConsoleTerminal,
	ConsoleTheme,
	ConsoleTools,
	SidebarAccount,
	SidebarName,
} from "@quickengine/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { type MouseEventHandler, useState } from "react";
import { AssistantPanel } from "../components/assistant-panel";
import { DevConsole } from "../components/dev-console";
import { FeedbackDialog } from "../components/feedback-dialog";
import { HeaderActionProvider } from "../components/header-action";
import { IntegrationsPanel } from "../components/integrations-panel";
import { NotificationToasts } from "../components/notification-toasts";
import { QuickActions } from "../components/quick-actions";
import { QuickToolsPanel } from "../components/quicktools-panel";
import { SettingsDialog } from "../components/settings-dialog";
import { SidebarCard } from "../components/sidebar-card";
import { StorefrontButton } from "../components/storefront-button";
import {
	helpWasOpen,
	rememberHelpOpen,
	SupportBubble,
} from "../components/support-bubble";
import { WorkspaceBreadcrumb } from "../components/workspace-breadcrumb";
import { WorkspaceNav } from "../components/workspace-nav";
import { WorkspaceNotifications } from "../components/workspace-notifications";
import { WorkspaceSearch } from "../components/workspace-search";
import { sessionApi, workspaceApi } from "../lib/api";
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
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [toolsOpen, setToolsOpen] = useState(false);
	const [integrationsOpen, setIntegrationsOpen] = useState(false);
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
			 * ⚠️ `grid-cols-[1fr_auto_1fr]`, not a flex row. The search has to be
			 * centred on the window rather than on whatever space the left group
			 * leaves, or it drifts every time a workspace name changes length.
			 */
			header={
				<div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3">
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
						className="flex min-w-0 items-center gap-1.5 justify-self-start"
					>
						<SidebarName
							compact
							name={context.data?.workspace.name ?? ""}
							// 🔴 Test mode is otherwise invisible, which is how a real card
							// gets taken in a test workspace — or a test card in the live one.
							badge={
								context.data?.workspace.environment === "test" ? "Test" : null
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
							onClick={() =>
								setSidebarContext((current) =>
									current === "notifications" ? "navigation" : "notifications",
								)
							}
						/>
					</div>

					<button
						type="button"
						onClick={() => setSearchOpen(true)}
						style={{}}
						className="flex h-9 w-[min(24rem,34vw)] items-center gap-2 rounded-md border border-[var(--console-line)] bg-[var(--console-panel)] px-2.5 text-[12px] text-[var(--ink-35)] transition-[box-shadow,color] duration-150 hover:text-[var(--ink-70)] active:translate-y-px"
					>
						<MagnifyingGlassIcon size={13} className="shrink-0" />
						<span className="min-w-0 flex-1 truncate text-left">Search</span>
						<span className="shrink-0 text-[10px] text-[var(--ink-25)]">
							⌘K
						</span>
					</button>

					<div className="flex items-center gap-1.5 justify-self-end">
						{/* Your own shop, first: it is the only control here that leaves
						    QuickDash, and the only one that can close a business. */}
						<StorefrontButton
							workspaceId={workspaceId}
							organizationId={context.data?.workspace.organizationId}
							published={context.data?.workspace.published ?? true}
						/>
						{/* Starting something new sits with the things that OPEN a
						    surface, at the head of the group. */}
						<QuickActions
							workspace={workspace}
							modules={context.data?.modules ?? []}
						/>
						{/* 🔑 Grouped by KIND: the two that summon a surface sit together,
						    then the preference, then you. QuickTools first because it is
						    about this workspace, the assistant is about the page. */}
						{/* The console is a DEVELOPER surface, so it sits with the other
						    things that summon a panel rather than beside the account. */}
						<ConsoleTerminal
							open={consoleOpen}
							onClick={() => setConsoleOpen((open) => !open)}
						/>
						<ConsoleTools
							open={toolsOpen}
							onClick={() => setToolsOpen((open) => !open)}
						/>
						<ConsoleTheme />
						{/* 🔑 They SHARE the right column, so opening one closes the
						    other. Leaving both true would leave the shell to arbitrate,
						    and a button that appears to do nothing is worse than one
						    that swaps. */}
						<ConsoleIntegrations
							open={integrationsOpen}
							onClick={() => {
								setIntegrationsOpen((open) => !open);
								setAssistantOpen(false);
							}}
						/>
						<ConsoleAssistant
							open={assistantOpen}
							onClick={() => {
								setAssistantOpen((open) => !open);
								setIntegrationsOpen(false);
							}}
						/>
						<SidebarAccount
							compact
							name={user.name ?? ""}
							email={user.email ?? ""}
							planId={plan.data?.planId ?? null}
							accountUrl={clientEnv.ACCOUNT_URL}
							authUrl={clientEnv.AUTH_URL}
							settingsHref={`/${workspace}/settings`}
							settingsLink={({ href, className, children }) => (
								<Link to={href} className={className}>
									{children}
								</Link>
							)}
							onSettings={() => setSettingsOpen(true)}
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
				sidebarContext === "notifications" ? (
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
			bottomOpen={consoleOpen}
			bottom={<DevConsole workspaceId={workspaceId} />}
			integrationsOpen={integrationsOpen}
			integrations={
				<IntegrationsPanel
					workspaceId={workspaceId}
					organizationId={context.data?.workspace.organizationId}
					workspace={workspace}
				/>
			}
			assistant={<AssistantPanel onClose={() => setAssistantOpen(false)} />}
			overlays={
				<>
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
						onFeedback={() => setFeedbackOpen(true)}
					/>
					{/* Reads the same list the bell does, so a toast is only ever a
					    preview of a row that is already durable. */}
					<SettingsDialog
						open={settingsOpen}
						onOpenChange={setSettingsOpen}
						workspaceId={workspaceId}
						modules={context.data?.modules ?? []}
						workspaceName={context.data?.workspace.name ?? ""}
						organizationId={context.data?.workspace.organizationId}
						accountUrl={clientEnv.ACCOUNT_URL}
						environment={context.data?.workspace.environment ?? "live"}
						apiUrl={clientEnv.API_URL}
					/>
					<NotificationToasts items={notifications.data?.items} />
				</>
			}
		>
			<Outlet />
		</ConsoleShell>
	);
}

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
		const workspaces = await context.queryClient.ensureQueryData(
			quickDashQueries.workspaces(),
		);
		const match = workspaces.items.find(
			(workspace) => workspace.slug === key || workspace.id === key,
		);
		// Unmatched falls through as-is: the API answers 404 for a workspace that
		// does not exist, which is the honest error rather than a redirect that
		// hides a typo.
		return { workspaceId: match?.id ?? key };
	},
	component: WorkspaceShell,
});

/** Cheap enough to test before spending a network round trip on a lookup. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
