import { resolveTestDatabaseUrl } from "@quickengine/db/testing";
import { defineConfig } from "vitest/config";

// Same pattern as the auth package: force the dedicated test DB and satisfy the
// env schema. Stripe values are dummies — the suite never hits Stripe's network
// (webhook crypto is local; checkout is mocked). A test price ID backs the
// plan↔price mapping tests.
// Package-specific test DB (set BEFORE resolveTestDatabaseUrl) so this suite
// doesn't share a database with the auth suite when turbo runs them in parallel.
process.env.TEST_DB_NAME = "quickengine_test_billing";
const testDatabaseUrl = resolveTestDatabaseUrl();
const testAuthSecret =
	process.env.BETTER_AUTH_SECRET ?? "test-better-auth-secret-0000000000000000";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET = testAuthSecret;
process.env.STRIPE_SECRET_KEY =
	process.env.STRIPE_SECRET_KEY ?? "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET =
	process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test_dummy";
process.env.STRIPE_PRICE_GROW_MONTHLY =
	process.env.STRIPE_PRICE_GROW_MONTHLY ?? "price_test_grow_monthly";

export default defineConfig({
	test: {
		// 🔴 Raised from vitest's 5000ms default on 2026-08-03, after CI failed
		// four times in one day on work that had actually COMPLETED. Real numbers
		// from those runs: scrypt password hashing 5444ms, building the 220-route
		// OpenAPI table 5456ms. Neither is a hang — a loaded CI runner is simply
		// slower than a laptop, and the budget was smaller than the work.
		//
		// A genuinely stuck test still fails, just later. A test that needs 30s of
		// real work is a different problem, and one this number makes visible
		// rather than hiding behind a timeout nobody trusts.
		testTimeout: 30_000,
		// Hooks get longer still: `truncateAll` issues TRUNCATE across every table
		// between tests, and globalSetup applies the full migration history.
		hookTimeout: 60_000,
		globals: true,
		environment: "node",
		pool: "forks",
		fileParallelism: false,
		globalSetup: ["./test/global-setup.ts"],
		setupFiles: ["./test/setup.ts"],
		include: ["test/**/*.test.ts"],
		env: {
			TEST_DB_NAME: "quickengine_test_billing",
			NODE_ENV: "test",
			DATABASE_URL: testDatabaseUrl,
			BETTER_AUTH_SECRET: testAuthSecret,
			STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
			STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
			STRIPE_PRICE_GROW_MONTHLY: process.env.STRIPE_PRICE_GROW_MONTHLY,
		},
	},
});
