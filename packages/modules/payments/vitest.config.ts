import { defineConfig } from "vitest/config";

// Pure, DB-free unit tests (fee math, the payment state machine, settings/manifest).
// The Stripe Connect integration + DB-backed reconciliation get harnesses later.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
