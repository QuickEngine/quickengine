import * as Sentry from "@sentry/react";

/**
 * QuickDash browser error monitoring.
 *
 * The application is a static SPA; API/server failures are reported separately
 * by the Node.js Sentry project in `services/api`.
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
