import * as Sentry from "@sentry/nextjs";

// Server-side Sentry init. No-ops without a DSN, and gated to production so dev
// noise doesn't hit the project. DSN + org/project/token come from env.
Sentry.init({
	dsn: process.env.SENTRY_DSN,
	enabled: process.env.NODE_ENV === "production",
	tracesSampleRate: 1.0,
});
