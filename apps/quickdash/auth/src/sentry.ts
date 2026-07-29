import * as Sentry from "@sentry/react";

/**
 * Error monitoring.
 *
 * Auth is now a static SPA. Identity server failures are reported separately by
 * the Node.js Sentry project in `services/api`.
 *
 * **Initialised only when a DSN is present**, so local development and preview
 * builds stay silent rather than reporting noise as production incidents.
 */
export function initSentry() {
	const dsn = import.meta.env.VITE_SENTRY_DSN;
	if (!dsn) return;

	Sentry.init({
		dsn,
		environment: import.meta.env.MODE,
		tracesSampleRate: 0.1,
		sendDefaultPii: false,
	});
}
