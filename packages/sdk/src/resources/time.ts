import type { QuickClient } from "../client";
import type {
	QuickCursorPage,
	QuickManualTimeEntryInput,
	QuickResponse,
	QuickTimeEntry,
	QuickTimeEntryStatus,
	QuickTimeInvoiceResult,
	QuickTimerStartInput,
} from "../types";

/**
 * Typed client for a workspace's tracked time. Reached as `quick.time`.
 *
 * Time moves through draft, approved, and invoiced, and is voided rather than deleted once it has
 * been approved — so a billing history is never quietly rewritten.
 */
export class TimeResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			limit?: number;
			projectId?: string;
			taskId?: string;
			trackerKey?: string;
			status?: QuickTimeEntryStatus;
			from?: Date | string;
			to?: Date | string;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickTimeEntry>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.projectId) query.set("projectId", options.projectId);
		if (options.taskId) query.set("taskId", options.taskId);
		if (options.trackerKey) query.set("trackerKey", options.trackerKey);
		if (options.status) query.set("status", options.status);
		if (options.from)
			query.set(
				"from",
				options.from instanceof Date
					? options.from.toISOString()
					: options.from,
			);
		if (options.to)
			query.set(
				"to",
				options.to instanceof Date ? options.to.toISOString() : options.to,
			);
		return this.client.request(`/time-entries${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickTimeEntry>(
			`/time-entries/${encodeURIComponent(id)}`,
		);
	}
	/** Log time after the fact. */
	log(input: QuickManualTimeEntryInput, idempotencyKey: string) {
		return this.client.request<QuickTimeEntry>("/time-entries", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	update(id: string, patch: QuickManualTimeEntryInput, idempotencyKey: string) {
		return this.client.request<QuickTimeEntry>(
			`/time-entries/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/time-entries/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}

	/**
	 * Start a timer. Retrying with the same key replays the same timer rather than starting a
	 * second one; a genuine second timer on the same tracker is refused.
	 */
	startTimer(input: QuickTimerStartInput, idempotencyKey: string) {
		return this.client.request<QuickTimeEntry>("/timers", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	stopTimer(id: string, endedAt: Date | string, idempotencyKey: string) {
		return this.client.request<QuickTimeEntry>(
			`/timers/${encodeURIComponent(id)}/stop`,
			{
				method: "POST",
				body: {
					endedAt: endedAt instanceof Date ? endedAt.toISOString() : endedAt,
				},
				idempotencyKey,
			},
		);
	}

	approve(
		id: string,
		idempotencyKey: string,
		options: {
			mode?: "nearest" | "up" | "down";
			incrementMinutes?: number;
		} = {},
	) {
		return this.client.request<QuickTimeEntry>(
			`/time-entries/${encodeURIComponent(id)}/approve`,
			{ method: "POST", body: options, idempotencyKey },
		);
	}
	unapprove(id: string, idempotencyKey: string) {
		return this.client.request<QuickTimeEntry>(
			`/time-entries/${encodeURIComponent(id)}/unapprove`,
			{ method: "POST", idempotencyKey },
		);
	}
	/** Voiding keeps the record; approved time can't simply be deleted. */
	void(id: string, idempotencyKey: string) {
		return this.client.request<QuickTimeEntry>(
			`/time-entries/${encodeURIComponent(id)}/void`,
			{ method: "POST", idempotencyKey },
		);
	}
	restore(id: string, idempotencyKey: string) {
		return this.client.request<QuickTimeEntry>(
			`/time-entries/${encodeURIComponent(id)}/restore`,
			{ method: "POST", idempotencyKey },
		);
	}

	/** Attach approved billable time to a draft invoice. Invoice and entries move together. */
	attachToInvoice(
		invoiceId: string,
		entryIds: string[],
		idempotencyKey: string,
	) {
		return this.client.request<QuickTimeInvoiceResult>(
			"/time-entries/invoice",
			{ method: "POST", body: { invoiceId, entryIds }, idempotencyKey },
		);
	}
	detachFromInvoice(
		invoiceId: string,
		entryIds: string[],
		idempotencyKey: string,
	) {
		return this.client.request<QuickTimeInvoiceResult>("/time-entries/detach", {
			method: "POST",
			body: { invoiceId, entryIds },
			idempotencyKey,
		});
	}
}
