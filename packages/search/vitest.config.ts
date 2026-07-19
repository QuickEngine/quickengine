import { defineConfig } from "vitest/config";

// Pure in-process unit suite — the Algolia provider is tested against a fake client and
// the selector against process.env, so no network or Algolia connection is involved.
export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
	},
});
