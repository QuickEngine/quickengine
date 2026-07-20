import { defineConfig, devices } from "@playwright/test";
import {
	provisionTestDb,
	resolveTestDatabaseUrl,
} from "@quickengine/db/testing";

// A dedicated e2e database, separate from `quickengine_test_integration`, so the
// two suites can never truncate each other mid-run.
process.env.TEST_DB_NAME = "quickengine_test_e2e";

/**
 * `resolveTestDatabaseUrl` swaps the database NAME but keeps the HOST — so with a
 * `.env.local` pointed at Neon it would resolve to a test-named database ON PRODUCTION.
 * These tests truncate every table between runs, so that must be impossible: refuse to
 * start unless the host is local. Set E2E_DATABASE_URL to run against something else
 * deliberately.
 */
function localDatabaseUrl(): string {
	const url = process.env.E2E_DATABASE_URL ?? resolveTestDatabaseUrl();
	const { hostname } = new URL(url);
	const isLocal =
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname === "host.docker.internal";
	if (!isLocal && !process.env.E2E_DATABASE_URL) {
		throw new Error(
			`Refusing to run e2e against a non-local database host "${hostname}". ` +
				"These tests truncate every table. Point DATABASE_URL at docker " +
				"(pnpm docker:up) or set E2E_DATABASE_URL to override deliberately.",
		);
	}
	return url;
}

const databaseUrl = localDatabaseUrl();
// The app and the seeding process must agree on the secret, or the session cookie
// we mint during setup won't validate against the running server.
const authSecret =
	process.env.BETTER_AUTH_SECRET ?? "test-better-auth-secret-0000000000000000";
const baseURL = "http://localhost:3011";

process.env.DATABASE_URL = databaseUrl;
process.env.BETTER_AUTH_SECRET = authSecret;
process.env.NODE_ENV = "test";

// Provision here rather than in globalSetup: Playwright waits for the webServer probe
// BEFORE running globalSetup, and the probe (/api/health) reports 503 until the database
// exists — so provisioning in globalSetup deadlocks. The app also needs the database to
// exist the moment it boots, which is earlier than globalSetup either way.
await provisionTestDb();

export default defineConfig({
	testDir: "./tests",
	// Server actions mutate shared workspace rows; run serially until the suite is
	// big enough to justify per-test workspace isolation.
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
	use: {
		baseURL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		// --webpack matches the rest of the repo: Turbopack fatal-errors here.
		command: "pnpm --filter @quickengine/quickdash dev",
		// Probe the health endpoint, not `/`: an unauthenticated `/` 307-redirects to
		// the auth app, which doesn't run under e2e, so the probe would follow the
		// redirect to a dead server and never go ready. /api/health also returns 200
		// only once the database is actually reachable — a stronger readiness signal.
		url: `${baseURL}/api/health`,
		reuseExistingServer: !process.env.CI,
		// Next cold start in this repo is ~16s; allow generous headroom.
		timeout: 180_000,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			DATABASE_URL: databaseUrl,
			BETTER_AUTH_SECRET: authSecret,
			TEST_DB_NAME: "quickengine_test_e2e",
		},
	},
});
