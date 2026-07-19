import * as Sentry from "@sentry/nextjs";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("./sentry.server.config");

		// Persist every committed domain event to the workspace activity feed. The
		// writer subscribes to the same process-wide bus the module writes emit on;
		// dynamic import keeps the postgres-backed db off the edge runtime. Idempotent
		// on event id, so this is safe even if a durable backstop is added later.
		const { getEventBus } = await import("@quickengine/events");
		const { recordActivity } = await import("@quickengine/db");
		const { configureSearchIndex, indexEventForSearch } = await import(
			"./app/_lib/search-indexer"
		);
		const bus = getEventBus();
		bus.subscribe((event) => recordActivity(event));
		// Keep the search index in sync with committed record events (best-effort).
		bus.subscribe((event) => indexEventForSearch(event));
		await configureSearchIndex();
	}
	if (process.env.NEXT_RUNTIME === "edge") {
		await import("./sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
