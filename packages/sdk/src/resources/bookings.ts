import type { QuickClient } from "../client";
import type {
	QuickBooking,
	QuickBookingInput,
	QuickBookingStatus,
	QuickCursorPage,
	QuickResponse,
} from "../types";

/**
 * Typed client for a workspace's bookings. Reached as `quick.bookings`.
 *
 * Slots are contended per `scheduleKey`: two live bookings can't overlap on the same key, but the
 * same clock time is free on a different one. Cancelling releases the slot for rebooking.
 */
export class BookingsResource {
	constructor(private readonly client: QuickClient) {}

	list(
		options: {
			cursor?: string;
			limit?: number;
			scheduleKey?: string;
			status?: QuickBookingStatus;
			/** Inclusive window on the booking's start time. */
			from?: Date | string;
			to?: Date | string;
		} = {},
	): Promise<QuickResponse<QuickCursorPage<QuickBooking>>> {
		const query = new URLSearchParams();
		if (options.cursor) query.set("cursor", options.cursor);
		if (options.limit) query.set("limit", String(options.limit));
		if (options.scheduleKey) query.set("scheduleKey", options.scheduleKey);
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
		return this.client.request(`/bookings${query.size ? `?${query}` : ""}`);
	}

	get(id: string) {
		return this.client.request<QuickBooking>(
			`/bookings/${encodeURIComponent(id)}`,
		);
	}
	create(input: QuickBookingInput, idempotencyKey: string) {
		return this.client.request<QuickBooking>("/bookings", {
			method: "POST",
			body: input,
			idempotencyKey,
		});
	}
	/** Only a requested or confirmed booking can be changed. */
	update(id: string, patch: QuickBookingInput, idempotencyKey: string) {
		return this.client.request<QuickBooking>(
			`/bookings/${encodeURIComponent(id)}`,
			{ method: "PATCH", body: patch, idempotencyKey },
		);
	}
	setStatus(
		id: string,
		status: QuickBookingStatus,
		idempotencyKey: string,
		options: { cancellationReason?: string | null } = {},
	) {
		return this.client.request<QuickBooking>(
			`/bookings/${encodeURIComponent(id)}/status`,
			{ method: "POST", body: { status, ...options }, idempotencyKey },
		);
	}
	/** Only a requested or cancelled booking can be deleted. */
	delete(id: string, idempotencyKey: string) {
		return this.client.request<{ id: string }>(
			`/bookings/${encodeURIComponent(id)}`,
			{ method: "DELETE", idempotencyKey },
		);
	}
}
