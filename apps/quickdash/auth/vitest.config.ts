import { defineConfig } from "vitest/config";

// Pure, DB-free unit tests for the auth app (e.g. the open-redirect guard).
// Distinct from the integration suite in @quickengine/auth, which needs Postgres.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["app/**/*.test.ts"],
	},
});
