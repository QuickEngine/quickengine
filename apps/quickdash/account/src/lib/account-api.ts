import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Organization = {
	id: string;
	name: string;
	isPersonal: boolean;
	role: string;
};

export type Workspace = {
	id: string;
	name: string;
	slug: string | null;
	businessType: string;
	environment: "test" | "live";
	modules: string[];
	archivedAt: string | null;
	createdAt: string;
};

/** Figures for one currency. Never summed across currencies — 100 USD plus
 * 100 EUR is 200 of nothing. */
export type RevenueTotal = {
	currency: string;
	collectedCents: number;
	refundedCents: number;
	netCents: number;
	paymentCount: number;
};

export type OrganizationRevenue = {
	from: string;
	to: string;
	totals: RevenueTotal[];
	workspaces: Array<
		RevenueTotal & { workspaceId: string; workspaceName: string }
	>;
	/** Only the days that saw money. Absent days are absent, not zero. */
	daily: Array<{
		day: string;
		workspaceId: string;
		currency: string;
		collectedCents: number;
		refundedCents: number;
		netCents: number;
	}>;
};

/** One committed domain event, e.g. `order.paid` in a named workspace. */
export type ActivityEvent = {
	seq: number;
	id: string;
	workspaceId: string;
	workspaceName: string;
	name: string;
	recordId: string;
	actorId: string | null;
	occurredAt: string;
};

export type PlanPricing = {
	planId: string;
	displayName: string;
	free: boolean;
	monthly: { amount: number; currency: string } | null;
	annual: { amount: number; currency: string } | null;
	limits: Record<string, number | null>;
};

/** One workspace's connection to one provider. */
export type Integration = {
	workspaceId: string;
	workspaceName: string;
	workspaceEnvironment: string;
	provider: string;
	environment: string;
	status: string;
	isDefault: boolean;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	/** Will actually take a card. Not the same as onboarding having finished. */
	connected: boolean;
	updatedAt: string;
};

/** One recorded control-plane action. */
export type AuditEntry = {
	id: string;
	action: string;
	actorId: string;
	actorType: string;
	actorName: string | null;
	actorEmail: string | null;
	resourceType: string;
	resourceId: string;
	requestId: string;
	occurredAt: string;
	metadata: Record<string, string | number | boolean | null>;
};

/** A role is a name plus permissions. Nothing branches on the name. */
export type OrganizationRole = {
	id: string;
	name: string;
	description: string | null;
	capabilities: string[];
};

export type Settlement = {
	id: string;
	workspaceId: string;
	workspaceName: string;
	clientName: string | null;
	amountCents: number;
	currency: string;
	status: string;
	provider: string;
	paymentMethod: string;
	environment: string;
	settledAt: string;
};

export type NotificationSignal = "news" | "attention" | "failure";

export type Notification = {
	id: string;
	type: string;
	/**
	 * How loudly to say it, decided by whatever produced the notification. The
	 * same field QuickDash reads — one inbox, one severity, two consoles.
	 */
	signal: NotificationSignal;
	title: string;
	body: string | null;
	href: string | null;
	readAt: string | null;
	createdAt: string;
};

const withOrganization = (path: string, organizationId: string) => {
	const query = new URLSearchParams({ organizationId });
	return `${path}?${query.toString()}`;
};

export const accountQueries = {
	organizations: () =>
		queryOptions({
			queryKey: ["account", "organizations"],
			queryFn: async () =>
				(await api.request<{ items: Organization[] }>("/account/organizations"))
					.data,
		}),
	workspaces: (organizationId: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "workspaces"],
			queryFn: async () =>
				(
					await api.request<{ items: Workspace[] }>(
						withOrganization("/account/workspaces", organizationId),
					)
				).data,
			enabled: Boolean(organizationId),
		}),
	/**
	 * Organization revenue over a window, reconciled to real payment rows.
	 *
	 * Behind `billing.manage` on the server: what the whole company earns is not
	 * something every member of it gets to see.
	 */
	revenue: (organizationId: string, days: number, endingDaysAgo = 0) =>
		queryOptions({
			queryKey: ["account", organizationId, "revenue", days, endingDaysAgo],
			queryFn: async () => {
				const to = new Date(Date.now() - endingDaysAgo * 86_400_000);
				const from = new Date(to.getTime() - days * 86_400_000);
				// 🔴 One query string, built once. `withOrganization` appends its own
				// `?`, so handing it a path that already carries parameters produced
				// `…?from=X&to=Y?organizationId=Z` — the range failed to parse and the
				// page showed nothing at all.
				const query = new URLSearchParams({
					organizationId,
					from: from.toISOString(),
					to: to.toISOString(),
				});
				return (
					await api.request<OrganizationRevenue>(
						`/account/revenue?${query.toString()}`,
					)
				).data;
			},
			enabled: Boolean(organizationId),
		}),
	/**
	 * Everything happening across the organization, newest first.
	 *
	 * Polled rather than pushed. Realtime is per workspace, and subscribing to
	 * every workspace's channel from the control plane would open N sockets to
	 * render one list; a 20-second poll costs one request and is well inside the
	 * resolution anybody reads a feed at.
	 */
	activity: (organizationId: string, limit = 12) =>
		queryOptions({
			queryKey: ["account", organizationId, "activity", limit],
			queryFn: async () => {
				const query = new URLSearchParams({
					organizationId,
					limit: String(limit),
				});
				return (
					await api.request<{ items: ActivityEvent[] }>(
						`/account/activity?${query.toString()}`,
					)
				).data;
			},
			enabled: Boolean(organizationId),
			// 60s, not 20. A control-plane feed is read at human pace, and every
			// extra poll is another chance for one bad response to interrupt whoever
			// is working.
			refetchInterval: 60_000,
			refetchIntervalInBackground: false,
		}),
	/** Every service connected across the organization's workspaces. */
	integrations: (organizationId: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "integrations"],
			queryFn: async () =>
				(
					await api.request<{ items: Integration[] }>(
						withOrganization("/account/integrations", organizationId),
					)
				).data,
			enabled: Boolean(organizationId),
		}),
	/**
	 * The control-plane audit log: who changed access, billing or workspaces.
	 *
	 * Behind `members.manage` on the server — an audit trail names people and what
	 * they did to each other's access.
	 */
	audit: (organizationId: string, action?: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "audit", action ?? "all"],
			queryFn: async () => {
				const query = new URLSearchParams({ organizationId, limit: "100" });
				if (action) query.set("action", action);
				return (
					await api.request<{ items: AuditEntry[]; actions: string[] }>(
						`/account/audit?${query.toString()}`,
					)
				).data;
			},
			enabled: Boolean(organizationId),
		}),
	/** The organization's custom roles. */
	roles: (organizationId: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "roles"],
			queryFn: async () =>
				(
					await api.request<{ items: OrganizationRole[] }>(
						withOrganization("/account/roles", organizationId),
					)
				).data,
			enabled: Boolean(organizationId),
		}),
	/** Every permission a role can carry. */
	capabilities: (organizationId: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "capabilities"],
			queryFn: async () =>
				(
					await api.request<{ items: string[] }>(
						withOrganization("/account/capabilities", organizationId),
					)
				).data,
			enabled: Boolean(organizationId),
			staleTime: 10 * 60 * 1000,
		}),
	/**
	 * What every plan costs and includes.
	 *
	 * Prices come from Stripe, never from code — a tier costs whatever it is set
	 * to there. An unconfigured price returns null rather than a guess.
	 */
	pricing: (organizationId: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "pricing"],
			queryFn: async () =>
				(
					await api.request<{
						currentPlanId: string;
						pricing: PlanPricing[];
					}>(withOrganization("/account/billing/pricing", organizationId))
				).data,
			enabled: Boolean(organizationId),
		}),
	/** Prepaid balance and whether it tops itself up. */
	credits: (organizationId: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "credits"],
			queryFn: async () =>
				(
					await api.request<{
						balanceMicros: number;
						autoRecharge: {
							enabled: boolean;
							thresholdMicros: number;
							amountCents: number;
							hasPaymentMethod: boolean;
							lastFailureAt: string | null;
							lastFailureReason: string | null;
						} | null;
					}>(withOrganization("/account/credits", organizationId))
				).data,
			enabled: Boolean(organizationId),
		}),
	/** The itemised payments behind the revenue totals. */
	settlements: (organizationId: string, limit = 10) =>
		queryOptions({
			queryKey: ["account", organizationId, "settlements", limit],
			queryFn: async () => {
				const query = new URLSearchParams({
					organizationId,
					limit: String(limit),
				});
				return (
					await api.request<{ items: Settlement[] }>(
						`/account/settlements?${query.toString()}`,
					)
				).data;
			},
			enabled: Boolean(organizationId),
		}),
	/**
	 * Every module QuickDash ships, by id.
	 *
	 * 🔴 Read from the API, never from `@quickengine/module-registry` directly:
	 * the registry imports every module package and their Drizzle schemas, none of
	 * which belong in a browser bundle. Workspaces store module ids; this is what
	 * turns them into names.
	 */
	moduleCatalog: () =>
		queryOptions({
			queryKey: ["account", "module-catalog"],
			queryFn: async () =>
				(
					await api.request<{
						items: Array<{
							id: string;
							name: string;
							description: string;
							kind: "shared" | "domain";
							/** Enabling this brings these along; the server resolves them
							 * either way, so the UI has to show the same truth. */
							dependsOn: string[];
							status: "built" | "upcoming";
						}>;
					}>("/account/module-catalog")
				).data,
			staleTime: 10 * 60 * 1000,
		}),
	notifications: () =>
		queryOptions({
			queryKey: ["account", "notifications"],
			queryFn: async () =>
				(
					await api.request<{ items: Notification[]; unread: number }>(
						"/account/notifications",
					)
				).data,
		}),
	plan: (organizationId: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "plan"],
			queryFn: async () =>
				(
					await api.request<{
						planId: string;
						subscription: unknown | null;
						usage: Record<
							string,
							{
								used: number;
								limit: number | null;
								state: "ok" | "warn" | "over";
							}
						>;
					}>(withOrganization("/account/plan", organizationId))
				).data,
			enabled: Boolean(organizationId),
		}),
	members: (organizationId: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "members"],
			queryFn: async () =>
				(
					await api.request<{
						items: Array<{
							userId: string;
							name: string | null;
							email: string;
							role: string;
							joinedAt: string;
						}>;
					}>(withOrganization("/account/members", organizationId))
				).data,
			enabled: Boolean(organizationId),
		}),
	invitations: (organizationId: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "invitations"],
			queryFn: async () =>
				(
					await api.request<{
						items: Array<{
							id: string;
							email: string;
							role: string;
							status: string;
							expiresAt: string;
						}>;
					}>(withOrganization("/account/invitations", organizationId))
				).data,
			enabled: Boolean(organizationId),
		}),
	apiKeys: (organizationId: string, workspaceId: string) =>
		queryOptions({
			queryKey: ["account", organizationId, "apiKeys", workspaceId],
			queryFn: async () =>
				(
					await api.request<{
						items: Array<{
							id: string;
							name: string;
							type: string;
							prefix: string;
							capabilities: string[];
							/** Which websites may present this key. Empty means none can. */
							allowedOrigins: string[];
							createdAt: string;
							lastUsedAt: string | null;
							expiresAt: string | null;
							revokedAt: string | null;
						}>;
					}>(
						`/account/api-keys?${new URLSearchParams({
							organizationId,
							workspaceId,
						})}`,
					)
				).data,
			enabled: Boolean(organizationId && workspaceId),
		}),
};

export const activeOrganization = {
	key: "quickengine-active-organization",
	read(organizations: Organization[]) {
		const selected = localStorage.getItem(this.key);
		return (
			organizations.find((organization) => organization.id === selected) ??
			organizations.find((organization) => organization.isPersonal) ??
			organizations[0] ??
			null
		);
	},
	write(organizationId: string) {
		localStorage.setItem(this.key, organizationId);
	},
};

export function useActiveOrganization() {
	const organizations = useQuery(accountQueries.organizations());
	const selected = useQuery({
		queryKey: ["account", "activeOrganization"],
		queryFn: () => null as string | null,
		initialData: null as string | null,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const fallback = organizations.data
		? activeOrganization.read(organizations.data.items)
		: null;
	return {
		organizations,
		active:
			organizations.data?.items.find(
				(organization) => organization.id === selected.data,
			) ?? fallback,
	};
}
