import * as Sentry from "@sentry/react";
import { clientEnv } from "./lib/env";

/**
 * Error monitoring.
 *
 * Replaces `@sentry/nextjs`, which wrapped the Next build to capture both server
 * and browser errors and upload source maps. Marketing has **no server**, so only
 * the browser half is needed here.
 *
 * **Initialised only when a DSN is present**, so local development and preview
 * builds stay silent rather than reporting noise as production incidents.
 */
export function initSentry() {
	const dsn = clientEnv.SENTRY_DSN;
	if (!dsn) return;

	Sentry.init({
		dsn,
		environment: import.meta.env.MODE,
		// Marketing is high-traffic and low-risk; a full trace sample would cost
		// quota that the authenticated surfaces need more.
		tracesSampleRate: 0.1,
		sendDefaultPii: false,
	});
}
