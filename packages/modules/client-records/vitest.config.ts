import { defineConfig } from "vitest/config";

// Pure, DB-free unit tests for the module (the settings schema + manifest). The
// DB-backed CRUD/metering tests come with a DB harness for the module later.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
