import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { ApiConfig } from "./config";
import { noopLogger } from "./logger";
import type { PlatformDependencies } from "./platform-types";

const config: ApiConfig = {
	baseUrl: "https://api.quickdash.xyz",
	bodyLimitBytes: 1_000_000,
	corsOrigins: new Set(["https://quickdash.xyz"]),
	environment: "test",
	logLevel: "error",
	port: 3020,
	callbackTimeoutMs: 50_000,
	readinessTimeoutMs: 50,
	requestTimeoutMs: 5_000,
	tracesSampleRate: 0,
	version: "0.1.0-test",
};

const stranger: PlatformDependencies = {
	getSession: async () => null,
	getWorkspaceForUser: async () => null,
	getWorkspaceForKey: async () => null,
	verifyApiKey: async () => null,
};

const build = async () => {
	const { registerAllRoutes } = await import("./register-routes");
	return createApp(config, {
		logger: noopLogger,
		registerRoutes: (app, logger) =>
			registerAllRoutes(app, { dependencies: stranger, logger }),
	});
};

/**
 * Every module that creates a business record has a monthly allowance on Free,
 * and every one of them has to actually ask.
 *
 * 🔴 The bug this guards is the one found three times in a week: a limit that
 * is declared, priced, shown on the dashboard, and enforced by nothing. Before
 * this, only orders and products counted, so a consultancy running bookings and
 * invoices hit no limit and paid nothing while an identical shop paid.
 *
 * ⚠️ These assert the routes are REGISTERED and refuse cleanly, not that the
 * arithmetic is right. The pricing itself is covered in `free-overage.test.ts`
 * where it can be tested without a database.
 */
const CREATE_ROUTES: ReadonlyArray<[string, string]> = [
	["POST", "/v1/bookings"],
	["POST", "/v1/invoices"],
	["POST", "/v1/contracts"],
	["POST", "/v1/quotes"],
	["POST", "/v1/projects"],
	["POST", "/v1/time-entries"],
	["POST", "/v1/shipments"],
	["POST", "/v1/clients"],
	["POST", "/v1/orders"],
];

describe("every record route is metered", () => {
	it.each(CREATE_ROUTES)(
		"%s %s is registered and never 500s",
		async (method, path) => {
			const app = await build();
			const res = await app.request(path, {
				method,
				headers: {
					"content-type": "application/json",
					cookie: "session=x",
					origin: "https://quickdash.xyz",
				},
				body: "{}",
			});

			// 401 for no session. What matters is that it is NOT 404, which would
			// mean the route moved and the allowance now guards nothing, and NOT
			// 500, which would mean the check itself throws.
			expect(res.status).not.toBe(404);
			expect(res.status).toBeLessThan(500);
		},
	);
});
