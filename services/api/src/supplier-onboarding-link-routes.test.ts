import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { ApiConfig } from "./config";
import { noopLogger } from "./logger";
import type { PlatformDependencies } from "./platform-types";

/**
 * The public supplier onboarding link.
 *
 * 🔴 This is the only route in the API with no authorizer, so these tests exist
 * to prove the token really is the boundary — that a forged, edited or expired
 * link is refused before anything reaches the database or Stripe.
 */

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

/** Nobody. The route must not care: it has no authorizer at all. */
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

const WORKSPACE = "2cf09068-3704-406f-a34f-8fdce89e41ea";
const SUPPLIER = "9b1f7a2c-5d3e-4c11-8a44-0f2b6d7e9c33";

const open = async (token: string) => {
	const app = await build();
	return app.request(`https://api.quickdash.xyz/connect/supplier/${token}`);
};

beforeEach(() => {
	process.env.BETTER_AUTH_SECRET = "test-application-secret-value";
});

describe("public supplier onboarding link", () => {
	it("refuses a token that is not signed by us", async () => {
		const response = await open("v1.a.b.test.99999999999.forged");
		expect(response.status).toBe(400);
		expect(await response.text()).toContain("not valid");
	});

	it("refuses gibberish without throwing", async () => {
		for (const bad of ["x", "....", "%20", "v1"]) {
			const response = await open(bad);
			expect(response.status).toBe(400);
		}
	});

	it("tells an expired link apart, so the reader knows to ask again", async () => {
		const { createSupplierOnboardingToken } = await import(
			"@quickengine/mod-payments"
		);
		const { token } = createSupplierOnboardingToken({
			workspaceId: WORKSPACE,
			supplierId: SUPPLIER,
			environment: "test",
			ttlSeconds: 1,
			now: new Date(Date.now() - 60_000),
		});
		const response = await open(token);
		expect(response.status).toBe(410);
		expect(await response.text()).toContain("expired");
	});

	// A refusal must never be cached: the same URL yields a different Stripe
	// session every time, and an intermediary holding one would hand a second
	// supplier the first one's onboarding.
	it("is never cacheable", async () => {
		const response = await open("v1.a.b.test.99999999999.forged");
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	// It answers a person, not a machine — the reader is a supplier who clicked
	// a link in an email, not a client library.
	it("answers in plain text", async () => {
		const response = await open("nonsense");
		expect(response.headers.get("content-type")).toContain("text/plain");
	});

	it("needs no session, key or origin", async () => {
		// The same request an email client would make: no cookie, no origin.
		const app = await build();
		const response = await app.request(
			"https://api.quickdash.xyz/connect/supplier/nonsense",
		);
		// 400 is a refusal of the TOKEN. A 401/403 would mean the route had picked
		// up an authorizer, which would make it unusable by the people it is for.
		expect(response.status).toBe(400);
	});
});
