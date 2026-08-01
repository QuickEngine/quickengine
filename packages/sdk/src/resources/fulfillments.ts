import type { QuickClient } from "../client";
import type {
	QuickCursorPage,
	QuickFulfillment,
	QuickFulfillmentInput,
	QuickFulfillmentStatus,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's deliveries. Reached as `quick.fulfillments`. A delivery is the
 * universal record for handing over what was promised, whatever the module that promised it.
 */
export class FulfillmentsResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			direction?: "asc" | "desc";
			limit?: number;
			sort?: string;
			status?: QuickFulfillmentStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickFulfillment>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.sort) query.set("sort", options.sort);
		if (options.direction) query.set("direction", options.direction);
		if (options.status) query.set("status", options.status);
		return this.client.request(`/fulfillments${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickFulfillment>(
			`/fulfillments/${encodeURIComponent(id)}`,
		);
	}
	create(input: QuickFulfillmentInput, idempotencyKey: string) {
		return this.client.request<QuickFulfillment>("/fulfillments", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	setStatus(
		id: string,
		status: QuickFulfillmentStatus,
		idempotencyKey: string,
	) {
		return this.client.request<QuickFulfillment>(
			`/fulfillments/${encodeURIComponent(id)}/status`,
			{ method: "POST", body: { status }, idempotencyKey },
		);
	}
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/fulfillments/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
}
