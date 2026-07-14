import { defineConfig } from "vitest/config";

// Pure, DB-free unit tests for settings, manifest, and the fulfillment lifecycle.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
