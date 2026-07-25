import * as Sentry from "@sentry/nextjs";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("./sentry.server.config");

		// Domain events reach the activity feed, realtime, and the search index via
		// the outbox dispatcher — a scheduled Inngest function (app/api/inngest),
		// not in-process subscribers. An event committed alongside its write
		// survives a restart; a subscriber registered here would not, and would
		// only ever see events raised by this one process.
		//
		// All that remains at startup is declaring the search index's filter
		// attributes. Idempotent, and a no-op when search isn't configured.
		const { configureSearchIndex } = await import("./app/_lib/search-indexer");
		await configureSearchIndex();
	}
	if (process.env.NEXT_RUNTIME === "edge") {
		await import("./sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
