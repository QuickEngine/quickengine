import type { QuickClient } from "../client";
import type {
	QuickCursorPage,
	QuickQuote,
	QuickQuoteAcceptance,
	QuickQuoteInput,
	QuickQuoteStatus,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's quotes and estimates. Reached as `quick.quotes`. Covers the
 * full lifecycle: draft, send, accept/decline, convert to an invoice or order, and delete.
 */
export class QuotesResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			limit?: number;
			status?: QuickQuoteStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickQuote>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.status) query.set("status", options.status);
		return this.client.request(`/quotes${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickQuote>(`/quotes/${encodeURIComponent(id)}`);
	}
	create(input: QuickQuoteInput, idempotencyKey: string) {
		return this.client.request<QuickQuote>("/quotes", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	update(id: string, patch: QuickQuoteInput, idempotencyKey: string) {
		return this.client.request<QuickQuote>(
			`/quotes/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	send(id: string, idempotencyKey: string) {
		return this.client.request<QuickQuote>(
			`/quotes/${encodeURIComponent(id)}/send`,
			{ method: "POST", idempotencyKey },
		);
	}
	accept(id: string, acceptance: QuickQuoteAcceptance, idempotencyKey: string) {
		return this.client.request<QuickQuote>(
			`/quotes/${encodeURIComponent(id)}/accept`,
			{ method: "POST", body: acceptance, idempotencyKey },
		);
	}
	decline(id: string, idempotencyKey: string) {
		return this.client.request<QuickQuote>(
			`/quotes/${encodeURIComponent(id)}/decline`,
			{ method: "POST", idempotencyKey },
		);
	}
	/** Convert an accepted quote into an invoice or order. Returns the created record. */
	convert(id: string, target: "invoice" | "order", idempotencyKey: string) {
		return this.client.request<{ id: string; [field: string]: unknown }>(
			`/quotes/${encodeURIComponent(id)}/convert`,
			{ method: "POST", body: { target }, idempotencyKey },
		);
	}
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/quotes/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
}
