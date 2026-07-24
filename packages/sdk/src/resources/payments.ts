import type { QuickClient } from "../client";
import type {
	QuickCursorPage,
	QuickPayment,
	QuickPaymentInput,
	QuickPaymentStatus,
	QuickRefundInput,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's payments. Reached as `quick.payments`. Covers recording a
 * payment, moving its status, and issuing full or partial refunds.
 */
export class PaymentsResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			limit?: number;
			status?: QuickPaymentStatus;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickPayment>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.status) query.set("status", options.status);
		return this.client.request(`/payments${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickPayment>(
			`/payments/${encodeURIComponent(id)}`,
		);
	}
	record(input: QuickPaymentInput, idempotencyKey: string) {
		return this.client.request<QuickPayment>("/payments", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	setStatus(id: string, status: QuickPaymentStatus, idempotencyKey: string) {
		return this.client.request<QuickPayment>(
			`/payments/${encodeURIComponent(id)}/status`,
			{ method: "POST", body: { status }, idempotencyKey },
		);
	}
	refund(id: string, input: QuickRefundInput, idempotencyKey: string) {
		return this.client.request<{ id: string; [field: string]: unknown }>(
			`/payments/${encodeURIComponent(id)}/refund`,
			{ method: "POST", body: input, idempotencyKey },
		);
	}
}
