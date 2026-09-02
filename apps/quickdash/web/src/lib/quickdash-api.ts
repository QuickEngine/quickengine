import { queryOptions } from "@tanstack/react-query";
import { sessionApi, workspaceApi } from "./api";

export type QuickDashWorkspace = {
	id: string;
	name: string;
	slug: string | null;
	businessType: string;
	environment: "test" | "live";
	organizationId?: string | null;
	organizationName?: string | null;
};

/** One enabled module, named by the registry rather than by the frontend. */
export type QuickDashModule = {
	id: string;
	name: string;
	description: string;
	kind: "shared" | "domain";
	settings: unknown;
};

export type QuickDashContext = {
	workspace: QuickDashWorkspace;
	workspaces: QuickDashWorkspace[];
	modules: QuickDashModule[];
	role: string | undefined;
	checklist: {
		collapsed: boolean;
		dismissed: boolean;
		hasStoredState: boolean;
		items: import("../_lib/first-action-checklist").FirstActionChecklistItem[];
	};
	orientation: { shouldOffer: boolean };
};

/** A person's notification inbox. Shared with Account, deliberately. */
export type NotificationSignal = "news" | "attention" | "failure";

export type QuickDashNotification = {
	id: string;
	type: string;
	/**
	 * How loudly to say it, decided by whatever produced the notification rather
	 * than by a lookup table in this app. A type this build has never heard of
	 * still arrives with the right colour.
	 */
	signal: NotificationSignal;
	/** The record this is about, when it is about one. */
	recordId: string | null;
	title: string;
	body: string | null;
	href: string | null;
	readAt: string | null;
	createdAt: string;
};

/** One record the workspace search proxy matched. */
export type QuickDashSearchHit = {
	objectID: string;
	/** What was found, so the result can be grouped and iconified. */
	kind?:
		| "customer"
		| "order"
		| "product"
		| "invoice"
		| "quote"
		| "contract"
		| "booking"
		| "payment"
		| "shipment"
		| "supplier"
		| "purchase-order"
		| "project"
		| "task"
		| "discount"
		| "category"
		| "review"
		| "plan"
		| "time"
		| "file"
		| "content"
		| "zone"
		| "rate";
	title: string;
	description?: string;
	/** A module path relative to the workspace, e.g. `orders/discounts`. */
	url?: string;
};

/** One thing that needs a person, with enough of the records named to act on. */
export type HomeEntry = {
	id: string;
	count: number;
	samples: Array<{ id: string; label: string; detail?: string }>;
};

export type WorkspaceHome = {
	needsYou: HomeEntry[];
	today: HomeEntry[];
};

export const quickDashQueries = {
	/**
	 * What needs a person today.
	 *
	 * The browser's own time zone travels with the request: "today" is the
	 * operator's day, not UTC's, and a 6pm booking should not appear tomorrow.
	 */
	home: (workspaceId: string) =>
		queryOptions({
			queryKey: ["quickdash", workspaceId, "home"],
			queryFn: async () => {
				const timeZone =
					Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
				return (
					await workspaceApi(workspaceId).request<WorkspaceHome>(
						`/quickdash/home?timeZone=${encodeURIComponent(timeZone)}`,
					)
				).data;
			},
		}),
	/**
	 * Notifications, read through the ACCOUNT boundary.
	 *
	 * 🔑 One inbox for the person, not one per workspace. Somebody working across
	 * three businesses should not have to check three bells to learn one thing
	 * happened — and the underlying table is user-scoped, so this is the same
	 * list Account shows.
	 *
	 * ⏱ Refetched on a timer, because this is the only thing on screen that
	 * changes without the operator doing anything. A minute matches the outbox
	 * drain's own cadence — polling faster cannot surface an event sooner, it
	 * just asks a question the answer to which has not changed yet.
	 */
	notifications: (workspaceId: string) =>
		queryOptions({
			/**
			 * 🔴 Keyed on the workspace, and narrowed to its MODE.
			 *
			 * Sandbox and live records share the same tables, so without this a
			 * test order's "New order" sits in the bell looking exactly like a real
			 * customer paying. Keying on the workspace also stops one business's
			 * cached notifications showing while you are standing in another.
			 */
			queryKey: ["quickdash", workspaceId, "notifications"],
			queryFn: async () =>
				(
					await sessionApi.request<{
						items: QuickDashNotification[];
						unread: number;
					}>(
						`/account/notifications?workspaceId=${encodeURIComponent(workspaceId)}`,
					)
				).data,
			refetchInterval: 60_000,
			// Coming back to the tab is exactly when you want to know what you
			// missed, and it costs one request.
			refetchOnWindowFocus: true,
		}),
	/**
	 * The organisation's plan, for the tier badge in the header.
	 *
	 * Read from the account boundary rather than the QuickDash context, which
	 * carries no billing state. `sessionApi` because account endpoints are
	 * session-scoped, not workspace-scoped.
	 */
	plan: (organizationId: string | null | undefined) =>
		queryOptions({
			queryKey: ["quickdash", "plan", organizationId],
			queryFn: async () =>
				(
					await sessionApi.request<{
						planId: string;
						/**
						 * Every meter, with what the plan allows. The endpoint has always
						 * returned this; the type simply never admitted it, so nothing
						 * could read the one thing that makes an honest upgrade prompt
						 * possible — how close this account is to a limit it paid for.
						 */
						usage: Record<
							string,
							{
								meter: string;
								used: number;
								limit: number | null;
								remaining: number | null;
								exceeded: boolean;
							}
						>;
					}>(
						`/account/plan?organizationId=${encodeURIComponent(organizationId ?? "")}`,
					)
				).data,
			enabled: Boolean(organizationId),
		}),
	workspaces: () =>
		queryOptions({
			queryKey: ["quickdash", "workspaces"],
			queryFn: async () =>
				(
					await sessionApi.request<{ items: QuickDashWorkspace[] }>(
						"/quickdash/workspaces",
					)
				).data,
		}),
	context: (workspaceId: string) =>
		queryOptions({
			queryKey: ["quickdash", workspaceId, "context"],
			queryFn: async () =>
				(
					await workspaceApi(workspaceId).request<QuickDashContext>(
						"/quickdash/context",
					)
				).data,
		}),
};
