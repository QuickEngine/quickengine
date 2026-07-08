import { resolveTestDatabaseUrl } from "@quickengine/db/testing";
import { defineConfig } from "vitest/config";

// Point every part of the run — config, globalSetup, and workers — at the
// dedicated test database, and satisfy the env schema's two required fields
// (DATABASE_URL + a >=32-char BETTER_AUTH_SECRET). resolveTestDatabaseUrl forces
// a `quickengine_test*` database, so the suite can never touch dev/prod.
//
// Package-specific TEST_DB_NAME (set BEFORE resolveTestDatabaseUrl) so parallel
// turbo suites don't share one database and truncate each other mid-test.
process.env.TEST_DB_NAME = "quickengine_test_auth";
const testDatabaseUrl = resolveTestDatabaseUrl();
const testAuthSecret =
	process.env.BETTER_AUTH_SECRET ?? "test-better-auth-secret-0000000000000000";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET = testAuthSecret;

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		// Integration tests share one database; run files serially so their
		// truncation between tests can't race across parallel workers.
		pool: "forks",
		fileParallelism: false,
		globalSetup: ["./test/global-setup.ts"],
		setupFiles: ["./test/setup.ts"],
		include: ["test/**/*.test.ts"],
		env: {
			TEST_DB_NAME: "quickengine_test_auth",
			NODE_ENV: "test",
			DATABASE_URL: testDatabaseUrl,
			BETTER_AUTH_SECRET: testAuthSecret,
		},
	},
});
