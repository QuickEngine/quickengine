import type { QuickClient } from "../client";
import type { QuickActivityPage, QuickResponse } from "../types";

/**
 * The workspace activity feed. Reached as `quick.activity`.
 *
 * Realtime tells you *that* something happened; this tells you *what*, and — more
 * usefully — what you missed. Every entry carries a monotonic `seq`, and `since`
 * returns everything after one, so a client that was offline, asleep, or
 * mid-deploy catches up exactly rather than refetching the world.
 */
export class ActivityResource {
	constructor(private readonly client: QuickClient) {}

	/**
	 * The newest events first — what a page shows on load.
	 *
	 * Keep `cursor` from the response and pass it to `since()` afterwards.
	 */
	list(
		options: { limit?: number } = {},
	): Promise<QuickResponse<QuickActivityPage>> {
		const query = new URLSearchParams();
		if (options.limit) query.set("limit", String(options.limit));
		return this.client.request(`/activity${query.size ? `?${query}` : ""}`);
	}

	/**
	 * Everything after `cursor`, oldest first — the reconnect path.
	 *
	 * Apply them in order and keep the returned `cursor`. An empty page returns the
	 * cursor you asked with, so an idle period never rewinds you.
	 */
	since(
		cursor: number,
		options: { limit?: number } = {},
	): Promise<QuickResponse<QuickActivityPage>> {
		const query = new URLSearchParams({ since: String(cursor) });
		if (options.limit) query.set("limit", String(options.limit));
		return this.client.request(`/activity?${query}`);
	}
}
