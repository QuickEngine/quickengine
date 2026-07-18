import { resolveTestDatabaseUrl } from "@quickengine/db/testing";
import { defineConfig } from "vitest/config";

process.env.TEST_DB_NAME = "quickengine_test_integration";
const testDatabaseUrl = resolveTestDatabaseUrl();
const testAuthSecret =
	process.env.BETTER_AUTH_SECRET ?? "test-better-auth-secret-0000000000000000";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET = testAuthSecret;

export default defineConfig({
	test: {
		environment: "node",
		pool: "forks",
		fileParallelism: false,
		globalSetup: ["./test/global-setup.ts"],
		setupFiles: ["./test/setup.ts"],
		include: ["test/**/*.test.ts"],
		env: {
			TEST_DB_NAME: "quickengine_test_integration",
			NODE_ENV: "test",
			DATABASE_URL: testDatabaseUrl,
			BETTER_AUTH_SECRET: testAuthSecret,
		},
	},
});
