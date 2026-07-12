/// <reference path="./env.d.ts" />

import { z } from "zod";
import { clientEnvSchema } from "./client";

// Treats an empty string (a set-but-blank env var, e.g. `AUTH_COOKIE_DOMAIN=`)
// the same as an unset one. The inner schema is made optional so the resulting
// `undefined` validates — otherwise a blank value would fail as "expected string,
// received undefined" despite the caller marking the field optional.
const emptyStringAsUndefined = <TSchema extends z.ZodType>(schema: TSchema) =>
	z.preprocess(
		(value) => (value === "" ? undefined : value),
		z.optional(schema),
	);

export const serverEnvSchema = clientEnvSchema.extend({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
	DATABASE_URL: z.string().url(),
	// Set automatically by Vercel: "production" | "preview" | "development".
	// Unset locally and in CI.
	VERCEL_ENV: emptyStringAsUndefined(
		z.enum(["production", "preview", "development"]),
	),
	// Set to "true" ONLY on the production environment (paired with the prod
	// DATABASE_URL). Lets the DB client refuse to boot a non-production deploy
	// against the production database — see docs/COST_GUARDRAILS.md.
	DATABASE_IS_PRODUCTION: emptyStringAsUndefined(z.string()),
	REDIS_URL: z.string().url().default("redis://localhost:6381"),
	UPSTASH_REDIS_REST_URL: emptyStringAsUndefined(z.string().url()),
	UPSTASH_REDIS_REST_TOKEN: emptyStringAsUndefined(z.string()),
	BETTER_AUTH_SECRET: z.string().min(32),
	BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
	// Parent domain for cross-subdomain session cookies (e.g. ".quickengine.xyz").
	// Unset locally (localhost shares cookies across ports already).
	AUTH_COOKIE_DOMAIN: emptyStringAsUndefined(z.string()),
	INITIAL_ADMIN_EMAILS: emptyStringAsUndefined(z.string()),
	GOOGLE_CLIENT_ID: emptyStringAsUndefined(z.string()),
	GOOGLE_CLIENT_SECRET: emptyStringAsUndefined(z.string()),
	GITHUB_CLIENT_ID: emptyStringAsUndefined(z.string()),
	GITHUB_CLIENT_SECRET: emptyStringAsUndefined(z.string()),
	PUSHER_APP_ID: emptyStringAsUndefined(z.string()),
	PUSHER_KEY: emptyStringAsUndefined(z.string()),
	PUSHER_SECRET: emptyStringAsUndefined(z.string()),
	PUSHER_CLUSTER: emptyStringAsUndefined(z.string()),
	NEXT_PUBLIC_PUSHER_KEY: emptyStringAsUndefined(z.string()),
	NEXT_PUBLIC_PUSHER_CLUSTER: emptyStringAsUndefined(z.string()),
	LIVEKIT_URL: emptyStringAsUndefined(z.string().url()),
	LIVEKIT_API_KEY: emptyStringAsUndefined(z.string()),
	LIVEKIT_API_SECRET: emptyStringAsUndefined(z.string()),
	STRIPE_SECRET_KEY: emptyStringAsUndefined(z.string()),
	STRIPE_WEBHOOK_SECRET: emptyStringAsUndefined(z.string()),
	STRIPE_QUICKENGINE_SUITE_MONTHLY_PRICE_ID: emptyStringAsUndefined(z.string()),
	NEXT_PUBLIC_SENTRY_DSN: emptyStringAsUndefined(z.string().url()),
	SENTRY_DSN: emptyStringAsUndefined(z.string().url()),
	SENTRY_ORG: emptyStringAsUndefined(z.string()),
	SENTRY_PROJECT: emptyStringAsUndefined(z.string()),
	SENTRY_AUTH_TOKEN: emptyStringAsUndefined(z.string()),
	RESEND_API_KEY: emptyStringAsUndefined(z.string()),
	// Outbound sender, e.g. "QuickEngine <noreply@quickengine.xyz>". Must be on a
	// Resend-verified domain in prod; unset falls back to onboarding@resend.dev
	// (which only delivers to the Resend account owner).
	EMAIL_FROM: emptyStringAsUndefined(z.string()),
	RESEND_WEBHOOK_SECRET: emptyStringAsUndefined(z.string()),
	INNGEST_EVENT_KEY: emptyStringAsUndefined(z.string()),
	INNGEST_SIGNING_KEY: emptyStringAsUndefined(z.string()),
	BLOB_READ_WRITE_TOKEN: emptyStringAsUndefined(z.string()),
	CLOUDINARY_CLOUD_NAME: emptyStringAsUndefined(z.string()),
	CLOUDINARY_API_KEY: emptyStringAsUndefined(z.string()),
	CLOUDINARY_API_SECRET: emptyStringAsUndefined(z.string()),
	CLOUDINARY_URL: emptyStringAsUndefined(z.string()),
	ALGOLIA_APP_ID: emptyStringAsUndefined(z.string()),
	ALGOLIA_SEARCH_KEY: emptyStringAsUndefined(z.string()),
	ALGOLIA_ADMIN_KEY: emptyStringAsUndefined(z.string()),
});

export const serverEnv = serverEnvSchema.parse({
	NODE_ENV: process.env.NODE_ENV,
	DATABASE_URL: process.env.DATABASE_URL,
	VERCEL_ENV: process.env.VERCEL_ENV,
	DATABASE_IS_PRODUCTION: process.env.DATABASE_IS_PRODUCTION,
	REDIS_URL: process.env.REDIS_URL,
	UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
	UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
	BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
	BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
	AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN,
	INITIAL_ADMIN_EMAILS: process.env.INITIAL_ADMIN_EMAILS,
	GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
	GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
	GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
	PUSHER_APP_ID: process.env.PUSHER_APP_ID,
	PUSHER_KEY: process.env.PUSHER_KEY,
	PUSHER_SECRET: process.env.PUSHER_SECRET,
	PUSHER_CLUSTER: process.env.PUSHER_CLUSTER,
	NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY,
	NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
	LIVEKIT_URL: process.env.LIVEKIT_URL,
	LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
	LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
	STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
	STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
	STRIPE_QUICKENGINE_SUITE_MONTHLY_PRICE_ID:
		process.env.STRIPE_QUICKENGINE_SUITE_MONTHLY_PRICE_ID,
	NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
	SENTRY_DSN: process.env.SENTRY_DSN,
	SENTRY_ORG: process.env.SENTRY_ORG,
	SENTRY_PROJECT: process.env.SENTRY_PROJECT,
	SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
	RESEND_API_KEY: process.env.RESEND_API_KEY,
	EMAIL_FROM: process.env.EMAIL_FROM,
	RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
	INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
	INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
	BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
	CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
	CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
	CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
	CLOUDINARY_URL: process.env.CLOUDINARY_URL,
	ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID,
	ALGOLIA_SEARCH_KEY: process.env.ALGOLIA_SEARCH_KEY,
	ALGOLIA_ADMIN_KEY: process.env.ALGOLIA_ADMIN_KEY,
	NEXT_PUBLIC_QUICKENGINE_AUTH_URL:
		process.env.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
	NEXT_PUBLIC_QUICKENGINE_WEB_URL: process.env.NEXT_PUBLIC_QUICKENGINE_WEB_URL,
	NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL:
		process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL,
	NEXT_PUBLIC_QUICKDASH_WEB_URL: process.env.NEXT_PUBLIC_QUICKDASH_WEB_URL,
	NEXT_PUBLIC_QUICKDASH_ADMIN_URL: process.env.NEXT_PUBLIC_QUICKDASH_ADMIN_URL,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
