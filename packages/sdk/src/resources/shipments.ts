import type { QuickClient } from "../client";
import type {
	QuickCursorPage,
	QuickResponse,
	QuickShipment,
	QuickShipmentInput,
	QuickShipmentStatus,
	QuickShipmentTrackingPatch,
} from "../types";

/**
 * Typed client for a workspace's shipments. Reached as `quick.shipments`. Moving a shipment's
 * status also moves the delivery record behind it, so the two can never disagree.
 */
export class ShipmentsResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			limit?: number;
			orderId?: string;
			status?: QuickShipmentStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickShipment>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.orderId) query.set("orderId", options.orderId);
		if (options.status) query.set("status", options.status);
		return this.client.request(`/shipments${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickShipment>(
			`/shipments/${encodeURIComponent(id)}`,
		);
	}
	create(input: QuickShipmentInput, idempotencyKey: string) {
		return this.client.request<QuickShipment>("/shipments", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	update(id: string, patch: QuickShipmentInput, idempotencyKey: string) {
		return this.client.request<QuickShipment>(
			`/shipments/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	/** Pass `requireTracking` to refuse shipping without a tracking number. */
	setStatus(
		id: string,
		status: QuickShipmentStatus,
		idempotencyKey: string,
		options: { requireTracking?: boolean } = {},
	) {
		return this.client.request<QuickShipment>(
			`/shipments/${encodeURIComponent(id)}/status`,
			{
				method: "POST",
				body: { status, ...options },
				idempotencyKey,
			},
		);
	}
	updateTracking(
		id: string,
		patch: QuickShipmentTrackingPatch,
		idempotencyKey: string,
	) {
		return this.client.request<QuickShipment>(
			`/shipments/${encodeURIComponent(id)}/tracking`,
			{ method: "POST", body: patch, idempotencyKey },
		);
	}
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/shipments/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
}
