import { defineConfig } from "vitest/config";

// Pure in-process unit suite — the event bus fans out to injected fake providers,
// so no database or network is involved.
export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
	},
});
