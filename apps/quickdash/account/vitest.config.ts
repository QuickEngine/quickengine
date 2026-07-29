import { defineConfig } from "vitest/config";

// Pure, DB-free unit tests for the account app (e.g. the workspace slug helpers).
// Mirrors the auth app's config; DB-backed suites live in the packages.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["app/**/*.test.ts"],
	},
});
