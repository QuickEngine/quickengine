import {
	getDegradedProviders,
	reportProviderSelection,
	resetProviderHealthForTests,
} from "@quickengine/provider-health";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The response shape, tested against the health registry directly.
 *
 * The route itself is three lines over `getDegradedProviders()`; what is worth
 * pinning is the summarising it does, because a caller that gets `severity`
 * wrong shows a customer "everything is fine" while work is being discarded.
 */

const summarise = (degraded: ReturnType<typeof getDegradedProviders>) => ({
	healthy: degraded.length === 0,
	severity: degraded.some((entry) => entry.severity === "data-loss")
		? "data-loss"
		: degraded.length > 0
			? "feature-loss"
			: "healthy",
});

describe("integration health", () => {
	beforeEach(() => {
		resetProviderHealthForTests();
	});

	it("reports healthy when every provider is real", () => {
		expect(summarise(getDegradedProviders())).toEqual({
			healthy: true,
			severity: "healthy",
		});
	});

	it("reports feature-loss for a degraded but lossless provider", () => {
		reportProviderSelection({
			degraded: true,
			provider: "search",
			implementation: "empty provider",
			consequence: "every query returns no results",
			missing: ["ALGOLIA_APP_ID"],
			severity: "feature-loss",
		});

		expect(summarise(getDegradedProviders())).toEqual({
			healthy: false,
			severity: "feature-loss",
		});
	});

	// 🔴 The distinction that matters. Work accepted and then silently discarded is
	// a correctness failure, not a missing feature, and must not be flattened into
	// the same badge.
	it("escalates to data-loss even when a lossless degradation is also present", () => {
		reportProviderSelection({
			degraded: true,
			provider: "search",
			implementation: "empty provider",
			consequence: "every query returns no results",
			missing: ["ALGOLIA_APP_ID"],
			severity: "feature-loss",
		});
		reportProviderSelection({
			degraded: true,
			provider: "jobs",
			implementation: "in-memory queue",
			consequence: "enqueued jobs are accepted and then lost on cold start",
			missing: ["INNGEST_EVENT_KEY"],
			severity: "data-loss",
		});

		expect(summarise(getDegradedProviders()).severity).toBe("data-loss");
	});

	// The payload reaches an HTTP response now, not just a log line.
	it("carries variable names only, never values", () => {
		reportProviderSelection({
			degraded: true,
			provider: "search",
			implementation: "empty provider",
			consequence: "every query returns no results",
			missing: ["ALGOLIA_APP_ID", "ALGOLIA_ADMIN_KEY"],
			severity: "feature-loss",
		});

		const [entry] = getDegradedProviders();
		for (const name of entry.missing) {
			expect(name).toMatch(/^[A-Z0-9_]+$/);
		}
	});
});
