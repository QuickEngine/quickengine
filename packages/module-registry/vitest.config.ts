import { defineConfig } from "vitest/config";

// Pure, DB-free unit tests for the catalog + resolver logic (dependency graph,
// gating, settings validation). DB-backed enable/disable gets a harness later.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
