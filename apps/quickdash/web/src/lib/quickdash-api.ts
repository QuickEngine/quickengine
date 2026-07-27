import { queryOptions } from "@tanstack/react-query";
import { sessionApi, workspaceApi } from "./api";

export type QuickDashWorkspace = {
	id: string;
	name: string;
	slug: string | null;
	businessType: string;
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
