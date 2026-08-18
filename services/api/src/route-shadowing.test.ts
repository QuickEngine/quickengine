import { describe, expect, it } from "vitest";
import type { ApiConfig } from "./config";

const config = {
	baseUrl: "https://api.quickengine.test",
	bodyLimitBytes: 1024,
	callbackTimeoutMs: 50_000,
	corsOrigins: new Set<string>(),
	environment: "test",
	logLevel: "error",
	port: 3020,
	readinessTimeoutMs: 50,
	requestTimeoutMs: 1000,
	tracesSampleRate: 0,
	version: "0.1.0",
} as ApiConfig;

/**
 * A literal route must never be registered after a parameter route that would
 * swallow it.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * 🔴 This exact fault has now shipped TWICE. PR #419 fixed `/v1/payments/connect`
 * being captured by `/v1/payments/:id` and parsed as a payment uuid. It happened
 * again the moment `/v1/inventory/suppliers` was added below
 * `/v1/inventory/:id`: the word "suppliers" was parsed as a stock-record id and
 * the whole page failed with a 400 that said nothing about routing.
 *
 * ⚠️ Neither occurrence was visible in review, and neither was catchable by an
 * unauthenticated probe — authorization runs before the handler, so the route
 * answers 401 and looks correctly wired right up until somebody signs in.
 *
 * Hono matches in registration order, so the rule is simply: literal segments
 * first. This test enumerates the real route table and enforces it, rather than
 * trusting anybody to remember.
 */
describe("route registration order", () => {
	it("registers no literal route behind a parameter route that shadows it", async () => {
		const { createApp } = await import("./app");
		const { registerAllRoutes } = await import("./register-routes");
		const { noopLogger } = await import("./logger");

		const app = createApp(config, {
			logger: noopLogger,
			registerRoutes: (instance, logger) =>
				registerAllRoutes(instance, {
					dependencies: {
						getSession: async () => null,
						getWorkspaceForUser: async () => null,
						getWorkspaceForKey: async () => null,
						verifyApiKey: async () => null,
					},
					logger,
				}),
		});

		const routes = app.routes.filter(
			(route) => route.path.startsWith("/v1") && route.method !== "ALL",
		);

		/** Would `pattern`, registered earlier, capture a request for `path`? */
		const shadows = (pattern: string, path: string) => {
			const a = pattern.split("/");
			const b = path.split("/");
			if (a.length !== b.length) return false;
			let usesParam = false;
			for (const [index, segment] of a.entries()) {
				if (segment.startsWith(":")) {
					// A wildcard only shadows a LITERAL segment. Two parameter routes
					// at the same position are the same route, not a conflict.
					if (b[index]?.startsWith(":")) return false;
					usesParam = true;
					continue;
				}
				if (segment !== b[index]) return false;
			}
			return usesParam;
		};

		const shadowed: string[] = [];
		for (const [index, route] of routes.entries()) {
			if (route.path.includes(":")) continue;
			for (const earlier of routes.slice(0, index)) {
				if (earlier.method !== route.method) continue;
				if (shadows(earlier.path, route.path)) {
					shadowed.push(
						`${route.method} ${route.path} is unreachable behind ${earlier.path}`,
					);
				}
			}
		}

		expect(shadowed).toEqual([]);
	});
});
