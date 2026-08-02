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

/** Nobody: every account lookup fails, so authorization refuses. */
const stranger: PlatformDependencies = {
	getSession: async () => null,
	getWorkspaceForUser: async () => null,
	getWorkspaceForKey: async () => null,
	verifyApiKey: async () => null,
};

const build = async (dependencies: PlatformDependencies) => {
	const { registerAllRoutes } = await import("./register-routes");
	return createApp(config, {
		logger: noopLogger,
		registerRoutes: (app, logger) =>
			registerAllRoutes(app, { dependencies, logger }),
	});
};

const headers = {
	"content-type": "application/json",
	cookie: "session=x",
	origin: "https://quickdash.xyz",
};

/**
 * These routes exist because the credit functions they call had NO caller —
 * nobody could buy credits. A route that 500s is indistinguishable from one that
 * does not exist, which is exactly how `/v1/product-events` shipped broken, so
 * every one of them is exercised here rather than assumed.
 */
describe("credit routes", () => {
	it.each([
		["GET", "/v1/account/credits", undefined],
		["POST", "/v1/account/credits/top-up", "{}"],
		["PUT", "/v1/account/credits/auto-recharge", "{}"],
	])("%s %s is registered and never 500s", async (method, path, body) => {
		const app = await build(stranger);
		const res = await app.request(path, { method, headers, body });

		// 401 for no session. What matters is that it is NOT 404 (unregistered)
		// and NOT 500 (throws before it can refuse).
		expect(res.status).not.toBe(404);
		expect(res.status).toBeLessThan(500);
	});
});
