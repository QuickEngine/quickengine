import type { QuickClient } from "../client";
import type {
	QuickCursorPage,
	QuickInventoryAdjustment,
	QuickInventoryAdjustmentInput,
	QuickInventoryItem,
	QuickInventoryItemInput,
	QuickInventoryStatus,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's stock. Reached as `quick.inventory`. Balances are never set
 * directly — every change is a recorded movement, so the history always explains the number.
 */
export class InventoryResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			direction?: "asc" | "desc";
			limit?: number;
			sort?: string;
			status?: QuickInventoryStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickInventoryItem>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.sort) query.set("sort", options.sort);
		if (options.direction) query.set("direction", options.direction);
		if (options.status) query.set("status", options.status);
		return this.client.request(`/inventory${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickInventoryItem>(
			`/inventory/${encodeURIComponent(id)}`,
		);
	}
	create(input: QuickInventoryItemInput, idempotencyKey: string) {
		return this.client.request<QuickInventoryItem>("/inventory", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	update(
		id: string,
		patch: { lowStockThreshold?: number; metadata?: Record<string, unknown> },
		idempotencyKey: string,
	) {
		return this.client.request<QuickInventoryItem>(
			`/inventory/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	setStatus(id: string, status: QuickInventoryStatus, idempotencyKey: string) {
		return this.client.request<QuickInventoryItem>(
			`/inventory/${encodeURIComponent(id)}/status`,
			{ method: "POST", body: { status }, idempotencyKey },
		);
	}
	/** Recent movements for one record, newest first. */
	listAdjustments(id: string, options: { limit?: number } = {}) {
		const query = new URLSearchParams();
		if (options.limit) query.set("limit", String(options.limit));
		return this.client.request<{ items: QuickInventoryAdjustment[] }>(
			`/inventory/${encodeURIComponent(id)}/adjustments${query.size ? `?${query}` : ""}`,
		);
	}
	adjust(
		id: string,
		input: QuickInventoryAdjustmentInput,
		idempotencyKey: string,
	) {
		return this.client.request<QuickInventoryAdjustment>(
			`/inventory/${encodeURIComponent(id)}/adjustments`,
			{ method: "POST", body: input, idempotencyKey },
		);
	}
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/inventory/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
}
