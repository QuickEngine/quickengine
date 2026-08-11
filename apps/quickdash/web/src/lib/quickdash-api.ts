import { queryOptions } from "@tanstack/react-query";
import { sessionApi, workspaceApi } from "./api";

export type QuickDashWorkspace = {
	id: string;
	name: string;
	slug: string | null;
	businessType: string;
	environment: "test" | "live";
	organizationId?: string | null;
};

export type QuickDashContext = {
	workspace: QuickDashWorkspace;
	workspaces: QuickDashWorkspace[];
	modules: Array<{ id: string; settings: unknown }>;
	role: string | undefined;
	checklist: {
		collapsed: boolean;
		dismissed: boolean;
		hasStoredState: boolean;
		items: import("../_lib/first-action-checklist").FirstActionChecklistItem[];
	};
	orientation: { shouldOffer: boolean };
};

export const quickDashQueries = {
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
					await sessionApi.request<{ planId: string }>(
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
