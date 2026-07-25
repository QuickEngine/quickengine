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
		environment: "node",
		include: ["src/**/*.test.ts"],
		env: {
			NODE_ENV: "test",
			DATABASE_URL: process.env.DATABASE_URL,
			BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		},
	},
});
