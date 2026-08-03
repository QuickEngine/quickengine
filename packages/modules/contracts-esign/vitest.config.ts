import { resolveTestDatabaseUrl } from "@quickengine/db/testing";
import { defineConfig } from "vitest/config";

process.env.TEST_DB_NAME = "quickengine_test_contracts_esign";
const testDatabaseUrl = resolveTestDatabaseUrl();
const testAuthSecret =
	process.env.BETTER_AUTH_SECRET ?? "test-better-auth-secret-0000000000000000";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET = testAuthSecret;

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
		environment: "node",
		pool: "forks",
		fileParallelism: false,
		globalSetup: ["./test/global-setup.ts"],
		setupFiles: ["./test/setup.ts"],
		include: ["src/**/*.test.ts", "test/**/*.test.ts"],
		env: {
			TEST_DB_NAME: "quickengine_test_contracts_esign",
			NODE_ENV: "test",
			DATABASE_URL: testDatabaseUrl,
			BETTER_AUTH_SECRET: testAuthSecret,
		},
	},
});
