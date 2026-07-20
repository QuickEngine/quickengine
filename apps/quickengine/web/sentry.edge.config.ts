import * as Sentry from "@sentry/nextjs";

// Edge-runtime Sentry init (middleware / edge routes).
Sentry.init({
	dsn: process.env.SENTRY_DSN,
	enabled: process.env.NODE_ENV === "production",
	// 10% of transactions. Sentry bills on spans, so 100% is a cost problem the moment
	// real traffic arrives; 0.1 is a standard production sample and still surfaces trends.
	tracesSampleRate: 0.1,
	// Separates preview deploys from real users in Sentry. Vercel previews build with
	// NODE_ENV=production, so without this our own testing lands in the same stream as
	// customer errors — which defeats the point of watching it.
	environment:
		process.env.NEXT_PUBLIC_VERCEL_ENV ??
		process.env.VERCEL_ENV ??
		process.env.NODE_ENV,
});
