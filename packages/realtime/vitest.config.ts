import { defineConfig } from "vitest/config";

// Pure in-process unit suite — the Pusher provider is tested against a fake publisher
// and the selector against process.env, so no network or Pusher connection is involved.
export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
	},
});
