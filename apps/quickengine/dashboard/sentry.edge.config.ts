import * as Sentry from "@sentry/nextjs";

// Edge-runtime Sentry init (middleware / edge routes).
Sentry.init({
	dsn: process.env.SENTRY_DSN,
	enabled: process.env.NODE_ENV === "production",
	tracesSampleRate: 1.0,
});
