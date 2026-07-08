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
process.env.STRIPE_PRICE_PRO_MONTHLY =
	process.env.STRIPE_PRICE_PRO_MONTHLY ?? "price_test_pro_monthly";

export default defineConfig({
	test: {
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
			STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
		},
	},
});
