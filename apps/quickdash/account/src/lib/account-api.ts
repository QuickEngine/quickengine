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
	modules: string[];
	archivedAt: string | null;
	createdAt: string;
};

export type Notification = {
	id: string;
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
