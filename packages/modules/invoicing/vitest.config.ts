import { defineConfig } from "vitest/config";

// Pure, DB-free unit tests for the module (settings, manifest, money math). The
// DB-backed CRUD tests come with a DB harness for the modules later.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
