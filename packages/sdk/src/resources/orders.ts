import type { QuickClient } from "../client";
import type {
	QuickCursorPage,
	QuickOrder,
	QuickOrderDetail,
	QuickOrderFulfillmentRef,
	QuickOrderInput,
	QuickOrderStatus,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's orders. Reached as `quick.orders`. Covers draft CRUD, the
 * draft to placed to confirmed to processing to fulfilled status machine, and opening the
 * fulfillment record a confirmed order is delivered through.
 */
export class OrdersResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			direction?: "asc" | "desc";
			limit?: number;
			sort?: string;
			status?: QuickOrderStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickOrder>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.sort) query.set("sort", options.sort);
		if (options.direction) query.set("direction", options.direction);
		if (options.status) query.set("status", options.status);
		return this.client.request(`/orders${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickOrderDetail>(
			`/orders/${encodeURIComponent(id)}`,
		);
	}
	create(input: QuickOrderInput, idempotencyKey: string) {
		return this.client.request<QuickOrder>("/orders", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	update(id: string, patch: QuickOrderInput, idempotencyKey: string) {
		return this.client.request<QuickOrder>(
			`/orders/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	setStatus(id: string, status: QuickOrderStatus, idempotencyKey: string) {
		return this.client.request<QuickOrder>(
			`/orders/${encodeURIComponent(id)}/status`,
			{ method: "POST", body: { status }, idempotencyKey },
		);
	}
	/** Opens (or returns) the fulfillment record for a confirmed or processing order. */
	ensureFulfillment(id: string, idempotencyKey: string) {
		return this.client.request<QuickOrderFulfillmentRef>(
			`/orders/${encodeURIComponent(id)}/fulfillment`,
			{ method: "POST", idempotencyKey },
		);
	}
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/orders/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
}
