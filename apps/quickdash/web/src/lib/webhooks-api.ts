import { queryOptions } from "@tanstack/react-query";
import { workspaceApi } from "./api";

export type WebhookEndpoint = {
	id: string;
	url: string;
	description: string | null;
	eventNames: string[];
	enabled: boolean;
	createdAt: string;
};

export type WebhookDelivery = {
	id: string;
	endpointId: string;
	eventId: string;
	eventName: string;
	status: string;
	attempts: number;
	responseStatus: number | null;
	responseBody: string | null;
	error: string | null;
	deliveredAt: string | null;
	createdAt: string;
};

/**
 * Webhook endpoints and their delivery history.
 *
 * All of this has existed server-side since Step 8K — signing, retries, replay
 * and versioned events — with no UI at all. These queries expose it.
 */
export const webhookQueries = {
	endpoints: (workspaceId: string) =>
		queryOptions({
			queryKey: ["quickdash", workspaceId, "webhook-endpoints"],
			queryFn: async () =>
				(
					await workspaceApi(workspaceId).request<WebhookEndpoint[]>(
						"/webhook-endpoints",
					)
				).data,
		}),

	deliveries: (workspaceId: string, endpointId: string | null) =>
		queryOptions({
			queryKey: ["quickdash", workspaceId, "webhook-deliveries", endpointId],
			queryFn: async () =>
				(
					await workspaceApi(workspaceId).request<WebhookDelivery[]>(
						`/webhook-endpoints/${endpointId}/deliveries`,
					)
				).data,
			enabled: Boolean(endpointId),
		}),
};
