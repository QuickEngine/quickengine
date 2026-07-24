import type { QuickClient } from "../client";
import type {
	QuickCursorPage,
	QuickInvoice,
	QuickInvoiceInput,
	QuickInvoiceStatus,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's invoices. Reached as `quick.invoices`. Covers draft CRUD and
 * the draft to sent to paid to void status machine.
 */
export class InvoicesResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			limit?: number;
			status?: QuickInvoiceStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickInvoice>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.status) query.set("status", options.status);
		return this.client.request(`/invoices${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickInvoice>(
			`/invoices/${encodeURIComponent(id)}`,
		);
	}
	create(input: QuickInvoiceInput, idempotencyKey: string) {
		return this.client.request<QuickInvoice>("/invoices", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	update(id: string, patch: QuickInvoiceInput, idempotencyKey: string) {
		return this.client.request<QuickInvoice>(
			`/invoices/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	setStatus(id: string, status: QuickInvoiceStatus, idempotencyKey: string) {
		return this.client.request<QuickInvoice>(
			`/invoices/${encodeURIComponent(id)}/status`,
			{ method: "POST", body: { status }, idempotencyKey },
		);
	}
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/invoices/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
}
