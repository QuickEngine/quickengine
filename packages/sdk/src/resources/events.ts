import type { QuickClient } from "../client";
import type {
	QuickResponse,
	QuickTrafficEventInput,
	QuickTrafficEventResult,
} from "../types";

/**
 * Typed client for privacy-minimal site telemetry. Reached as `quick.events`. Safe to call
 * from a website with a publishable key; the server hashes visitor/session ids and is
 * idempotent on `eventId`.
 */
export class EventsResource {
	constructor(private readonly client: QuickClient) {}

	/** Record one traffic event (a page view). Idempotent on `input.eventId`. */
	record(
		input: QuickTrafficEventInput,
	): Promise<QuickResponse<QuickTrafficEventResult>> {
		const occurredAt =
			input.occurredAt instanceof Date
				? input.occurredAt.toISOString()
				: input.occurredAt;
		return this.client.request<QuickTrafficEventResult>("/events", {
			method: "POST",
			body: { ...input, occurredAt },
		});
	}
}
