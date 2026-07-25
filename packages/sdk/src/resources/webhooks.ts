import type { QuickClient } from "../client";
import type {
	QuickCreatedWebhookEndpoint,
	QuickResponse,
	QuickWebhookDelivery,
	QuickWebhookEndpoint,
	QuickWebhookEndpointInput,
	QuickWebhookEndpointPatch,
} from "../types";

/**
 * Typed client for a workspace's outbound webhooks. Reached as `quick.webhooks`.
 *
 * QuickEngine delivers events **at least once**: a network failure between our
 * send and your acknowledgement means the same event is sent again. Every
 * delivery carries a stable `id` — dedupe on it rather than assuming uniqueness.
 *
 * Verify the `QuickEngine-Signature` header on every request you receive; a URL
 * alone is not authentication. `verifyWebhookSignature` in this package does it.
 */
export class WebhooksResource {
	constructor(private readonly client: QuickClient) {}

	/** Every endpoint registered for this workspace. Secrets are never included. */
	list(): Promise<QuickResponse<QuickWebhookEndpoint[]>> {
		return this.client.request("/webhook-endpoints");
	}

	/**
	 * Registers an endpoint.
	 *
	 * The returned `secret` is shown **once** — there is no way to read it back.
	 * Store it before you discard the response. Omit `eventTypes` to receive
	 * every event.
	 */
	create(
		input: QuickWebhookEndpointInput,
	): Promise<QuickResponse<QuickCreatedWebhookEndpoint>> {
		return this.client.request("/webhook-endpoints", {
			method: "POST",
			body: input,
		});
	}

	get(id: string): Promise<QuickResponse<QuickWebhookEndpoint>> {
		return this.client.request(`/webhook-endpoints/${id}`);
	}

	update(
		id: string,
		patch: QuickWebhookEndpointPatch,
	): Promise<QuickResponse<QuickWebhookEndpoint>> {
		return this.client.request(`/webhook-endpoints/${id}`, {
			method: "PATCH",
			body: patch,
		});
	}

	delete(id: string): Promise<QuickResponse<{ id: string }>> {
		return this.client.request(`/webhook-endpoints/${id}`, {
			method: "DELETE",
		});
	}

	/** Delivery history for an endpoint, newest first — for debugging your receiver. */
	deliveries(
		id: string,
		options: { limit?: number; cursor?: string } = {},
	): Promise<QuickResponse<QuickWebhookDelivery[]>> {
		const query = new URLSearchParams();
		if (options.limit) query.set("limit", String(options.limit));
		if (options.cursor) query.set("cursor", options.cursor);
		const suffix = query.size ? `?${query}` : "";
		return this.client.request(`/webhook-endpoints/${id}/deliveries${suffix}`);
	}

	/** Queues a delivery to be attempted again, resetting its attempt counter. */
	replay(deliveryId: string): Promise<QuickResponse<QuickWebhookDelivery>> {
		return this.client.request(`/webhook-deliveries/${deliveryId}/replay`, {
			method: "POST",
		});
	}
}
