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
