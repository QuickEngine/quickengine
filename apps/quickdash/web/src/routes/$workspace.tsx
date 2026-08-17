import { authClient } from "@quickengine/auth/client";
import {
	ConsoleShell,
	SandboxBanner,
	SidebarAccount,
	SidebarName,
} from "@quickengine/ui";
import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import { type MouseEventHandler, useState } from "react";
import { FeedbackDialog } from "../components/feedback-dialog";
import {
	HeaderActionProvider,
	useHeaderSlots,
} from "../components/header-action";
import { NotificationToasts } from "../components/notification-toasts";
import {
	helpWasOpen,
	rememberHelpOpen,
	SupportBubble,
} from "../components/support-bubble";
import { WorkspaceHeader } from "../components/workspace-header";
import { MODULE_CHILDREN, WorkspaceNav } from "../components/workspace-nav";
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
	// Whatever the page on screen has published for the header.
	const header = useHeaderSlots();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const { user, workspaceId } = Route.useRouteContext();
	const context = useQuery(quickDashQueries.context(workspaceId));
	const plan = useQuery(
		quickDashQueries.plan(context.data?.workspace.organizationId),
	);
	const notifications = useQuery(quickDashQueries.notifications());
	/**
	 * Has anything ever called this workspace?
	 *
	 * 🔑 The SAME query key the Connect page uses, so this shares its cache
	 * rather than issuing a second request, and both agree on the answer. Polls
	 * only while nothing has called — once a key has been used the answer can
	 * never revert.
	 */
	const keys = useQuery({
		queryKey: ["quickdash", workspaceId, "api-keys"],
		queryFn: async () =>
			(
				await sessionApi.request<{
					items: Array<{ lastUsedAt: string | null; revokedAt: string | null }>;
				}>(`/account/api-keys?workspaceId=${encodeURIComponent(workspaceId)}`)
			).data,
		placeholderData: (previous) => previous,
		refetchInterval: (query) =>
			(query.state.data?.items ?? []).some(
				(key) => !key.revokedAt && key.lastUsedAt,
			)
				? false
				: 15_000,
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

	/**
	 * What to call the page you are on.
	 *
	 * 🔑 Derived from the address and the module registry rather than each page
	 * declaring its own title. A page that names itself is a page that can
	 * disagree with the sidebar row that led to it.
	 */
	const segments = pathname.split("/").filter(Boolean).slice(1);
	const currentModule = (context.data?.modules ?? []).find(
		(module) => module.id === segments[0],
	);
	const sectionLabel = currentModule
		? (MODULE_CHILDREN[currentModule.id] ?? []).find(
				([segment]) => segment === (segments[1] ?? ""),
			)?.[1]
		: undefined;
	const pageTitle = currentModule
		? (sectionLabel ?? currentModule.name)
		: segments.length === 0
			? "Home"
			: segments[0] === "media"
				? "Media"
				: segments[0] === "connect"
					? "Connect"
					: segments[0] === "settings"
						? "Settings"
						: undefined;

	const liveKeys = (keys.data?.items ?? []).filter((key) => !key.revokedAt);
	// Waiting only counts once a key EXISTS. A workspace with no keys has not
	// started connecting, so a spinner there would be waiting on nothing.
	const connectPending =
		liveKeys.length > 0 && liveKeys.every((key) => !key.lastUsedAt);
	const [searchOpen, setSearchOpen] = useState(false);
	const [feedbackOpen, setFeedbackOpen] = useState(false);
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
			header={
				<WorkspaceHeader
					title={pageTitle}
					crumb={header.crumb}
					actions={header.action}
				/>
			}
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
							navSignals(notifications.data?.items),
							"client-records/messages",
							unreadMessages,
						)}
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
					// Opens in place. The account menu used to have no handler here, so
					// QuickDash simply had no way to send feedback without leaving.
					onFeedback={() => setFeedbackOpen(true)}
					// Summons help in place rather than navigating to Account, so
					// whatever the person was doing survives asking for help.
					onHelp={() => showHelp(true)}
				/>
			}
			overlays={
				<>
					<WorkspaceSearch
						open={searchOpen}
						onOpenChange={setSearchOpen}
						workspaceId={workspaceId}
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
