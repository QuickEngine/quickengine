import { defineConfig } from "vitest/config";

// Pure, DB-free unit tests for the catalog + resolver logic (dependency graph,
// gating, settings validation). DB-backed enable/disable gets a harness later.
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
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
