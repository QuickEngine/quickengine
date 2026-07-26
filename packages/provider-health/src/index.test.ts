import { beforeEach, describe, expect, it } from "vitest";
import {
	getDegradedProviders,
	hasDataLossDegradation,
	isProductionDeployment,
	reportProviderSelection,
	resetProviderHealthForTests,
} from "./index";

const production = { VERCEL_ENV: "production" } as NodeJS.ProcessEnv;
const preview = { VERCEL_ENV: "preview" } as NodeJS.ProcessEnv;
const local = {} as NodeJS.ProcessEnv;

const jobsDegraded = {
	degraded: true,
	provider: "jobs",
	implementation: "in-memory queue",
	consequence: "enqueued jobs are lost on cold start",
	missing: ["INNGEST_EVENT_KEY"],
	severity: "data-loss",
} as const;

const searchDegraded = {
	degraded: true,
	provider: "search",
	implementation: "empty provider",
	consequence: "every query returns no results",
	missing: ["ALGOLIA_APP_ID"],
	severity: "feature-loss",
} as const;

beforeEach(resetProviderHealthForTests);

describe("isProductionDeployment", () => {
	it("is true only for a production deployment", () => {
		expect(isProductionDeployment(production)).toBe(true);
		expect(isProductionDeployment(preview)).toBe(false);
		expect(isProductionDeployment(local)).toBe(false);
	});

	// NODE_ENV is "production" for preview builds too. Keying off it would fire on
	// every preview deploy and train everyone to ignore the warning.
	it("ignores NODE_ENV", () => {
		expect(
			isProductionDeployment({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
		).toBe(false);
	});
});

describe("reporting", () => {
	it("stays silent off-production, where the fallback is intended", () => {
		const lines: string[] = [];
		reportProviderSelection(jobsDegraded, {
			env: local,
			log: (m) => lines.push(m),
		});
		expect(lines).toEqual([]);
	});

	it("logs loudly in production, naming the consequence", () => {
		const lines: string[] = [];
		reportProviderSelection(jobsDegraded, {
			env: production,
			log: (m) => lines.push(m),
		});
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("JOBS IS DEGRADED IN PRODUCTION");
		expect(lines[0]).toContain("enqueued jobs are lost on cold start");
		expect(lines[0]).toContain("INNGEST_EVENT_KEY");
		expect(lines[0]).toContain("DATA LOSS");
	});

	// The log line reaches stderr and log aggregation. Only variable *names* may
	// appear there, never values.
	it("reports variable names, never values", () => {
		const lines: string[] = [];
		reportProviderSelection(
			{ ...jobsDegraded, missing: ["INNGEST_EVENT_KEY"] },
			{ env: production, log: (m) => lines.push(m) },
		);
		expect(lines[0]).toContain("INNGEST_EVENT_KEY");
		expect(lines[0]).not.toMatch(/=\s*\S/);
	});

	it("records degradation regardless of environment", () => {
		reportProviderSelection(jobsDegraded, { env: local, log: () => {} });
		expect(getDegradedProviders()).toHaveLength(1);
	});

	it("clears a provider once it selects a real implementation", () => {
		reportProviderSelection(jobsDegraded, { env: local, log: () => {} });
		expect(getDegradedProviders()).toHaveLength(1);

		reportProviderSelection({ provider: "jobs", degraded: false });
		expect(getDegradedProviders()).toEqual([]);
	});

	it("tracks providers independently", () => {
		reportProviderSelection(jobsDegraded, { env: local, log: () => {} });
		reportProviderSelection(searchDegraded, { env: local, log: () => {} });
		expect(
			getDegradedProviders()
				.map((e) => e.provider)
				.sort(),
		).toEqual(["jobs", "search"]);
	});
});

describe("hasDataLossDegradation", () => {
	it("is false when nothing is degraded", () => {
		expect(hasDataLossDegradation()).toBe(false);
	});

	// The distinction readiness depends on: a missing search index must not take an
	// instance out of rotation, an evaporating job queue must.
	it("ignores feature loss and reports data loss", () => {
		reportProviderSelection(searchDegraded, { env: local, log: () => {} });
		expect(hasDataLossDegradation()).toBe(false);

		reportProviderSelection(jobsDegraded, { env: local, log: () => {} });
		expect(hasDataLossDegradation()).toBe(true);
	});
});
