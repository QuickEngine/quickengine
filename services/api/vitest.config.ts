import { defineConfig } from "vitest/config";

// The OpenAPI document imports every module package so it can derive request
// bodies from the schemas the routes validate with. Those packages reach the
// database client, which validates its environment at import time — so the suite
// needs a parseable environment even though no test touches a database.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
	"postgresql://quickengine:quickengine_dev_password@localhost:5435/quickengine_test_api";
process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret-0000000000000000";

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
		include: ["src/**/*.test.ts"],
		env: {
			NODE_ENV: "test",
			DATABASE_URL: process.env.DATABASE_URL,
			BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		},
	},
});
