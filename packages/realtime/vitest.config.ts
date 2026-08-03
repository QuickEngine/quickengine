import { defineConfig } from "vitest/config";

// Pure in-process unit suite — the Pusher provider is tested against a fake publisher
// and the selector against process.env, so no network or Pusher connection is involved.
export default defineConfig({
	test: {
		// 🔴 Raised from vitest's 5000ms default on 2026-08-03, after CI failed
		// four times in one day on work that had actually COMPLETED. Real numbers
		// from those runs: scrypt password hashing 5444ms, building the 220-route
		// OpenAPI table 5456ms. Neither is a hang — a loaded CI runner is simply
		// slower than a laptop, and the budget was smaller than the work.
		//
		// A genuinely stuck test still fails, just later. A test that needs 30s of
		// real work is a different problem, and one this number makes visible
		// rather than hiding behind a timeout nobody trusts.
		testTimeout: 30_000,
		// Hooks get longer still: `truncateAll` issues TRUNCATE across every table
		// between tests, and globalSetup applies the full migration history.
		hookTimeout: 60_000,
		environment: "node",
		include: ["test/**/*.test.ts"],
	},
});
