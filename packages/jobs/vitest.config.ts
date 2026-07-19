import { defineConfig } from "vitest/config";

// Pure in-process unit suite — the Inngest queue is tested against a fake sender and
// the selector against process.env, so no network or Inngest connection is involved.
export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
	},
});
