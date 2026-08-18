import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { ApiConfig } from "./config";
import { noopLogger } from "./logger";
import type {
	PlatformDependencies,
	PlatformEnv,
	WorkspaceResolution,
} from "./platform-types";

/**
 * Every `/v1` route must refuse a workspace the caller cannot reach.
 *
 * 🔴 **Why this exists.** Tenant scoping was tested feature by feature — nine
 * files, each covering the endpoints somebody happened to think about while
 * writing them. Against ~180 routes that is coverage by coincidence. One route
 * registered without an authorizer, or with the wrong one, leaks another
 * customer's data and nothing fails.
 *
 * **This enumerates the REAL route table** rather than a hand-written list, so a
 * route added tomorrow is covered the moment it is registered. A list would be
 * exactly as stale as the thing it is meant to protect.
 *
 * **The scenario is the realistic attack**, not a contrived one: a genuine,
 * fully valid session that simply has no membership in the workspace it is
 * asking about. `getWorkspaceForUser` returns `null` for every lookup here — the
 * same answer production gives when somebody pastes a workspace id that is not
 * theirs.
 *
 * A route that answers **2xx** under that scenario is serving data across a
 * tenant boundary.
 *
 * ⚠️ **What this does NOT catch, learned by trying.** Removing an authorizer
 * from an existing route usually makes its handler throw on `c.get("authorized")`
 * and return 500 — a non-2xx, which passes here. So this proves *no route serves
 * a non-member*, which is the leak condition, but it is not a check that every
 * route HAS an authorizer. Verified by planting a route that genuinely returns
 * data with no authorization: caught and named. Verified again the naive way
 * first, which passed and should not have.
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

/** A real session that belongs to nothing. */
const dependencies: PlatformDependencies = {
	getSession: async () => ({ userId: "intruder", sessionId: "s-1" }),
	// 🔴 The core of the test. Null means "you are not a member", which is what
	// production returns for another tenant's workspace.
	getWorkspaceForUser: async () => null,
	getWorkspaceForKey: async () => null,
	verifyApiKey: async () => null,
};

const TARGET_WORKSPACE = "00000000-0000-4000-8000-0000000a0001";
const OTHER_WORKSPACE = "00000000-0000-4000-8000-0000000b0002";

const workspaceFor = (id: string): WorkspaceResolution => ({
	capabilities: [],
	enabledModuleIds: [],
	organizationId: `org-${id}`,
	ownerId: `owner-${id}`,
	workspace: {
		businessType: "test",
		environment: "live",
		published: true,
		id,
		name: "Test",
		slug: "test",
	},
});

const adversarialDependencies: PlatformDependencies = {
	...dependencies,
	getWorkspaceForKey: async (id) => workspaceFor(id),
	verifyApiKey: async (raw) => {
		if (raw === "sk_workspace_a") {
			return {
				allowedOrigins: [],
				capabilities: [],
				id: "key_server_a",
				type: "secret",
				workspaceId: TARGET_WORKSPACE,
			};
		}
		if (raw === "pk_workspace_a") {
			return {
				allowedOrigins: [],
				capabilities: [],
				id: "key_browser_a",
				type: "publishable",
				workspaceId: TARGET_WORKSPACE,
			};
		}
		return null;
	},
	resolveCustomerSession: async (token) =>
		token === "customer_workspace_b"
			? {
					clientRecordId: "client_b",
					email: "customer-b@example.test",
					identityId: "identity_b",
					workspaceCustomerId: "customer_b",
					workspaceId: OTHER_WORKSPACE,
				}
			: null,
};

/**
 * Routes that legitimately answer without a workspace.
 *
 * Each is here for a stated reason, and the list is deliberately tiny — anything
 * added to it is a route nobody is checking, so it needs to be obviously safe.
 */
const NOT_WORKSPACE_SCOPED = [
	// Account-level: scoped to the session's own organization, never to a
	// workspace supplied by the caller.
	"/v1/account",
	// Session-scoped workspace switcher. It ignores the workspace header and
	// returns only memberships resolved from the signed-in user; a 200 with an
	// empty list is the correct non-member response, not a tenant leak.
	"/v1/quickdash/workspaces",
	/**
	 * 🔴 `/v1/catalog` was here as "platform metadata with no tenant data". That
	 * was wrong — it is the products-services module and its 8 routes carry a
	 * workspace's real product catalog. `skipped()` is a prefix match, so the
	 * sweep silently covered 8 fewer routes than it claimed. They are swept now.
	 *
	 * `/v1/modules` was also here and matches no registered route at all.
	 */
	// The public signing link. The token IS the authorization and the recipient
	// has no session, so a membership check would make signing impossible.
	"/v1/quickdash/sign",
	/**
	 * Org-scoped, not workspace-scoped, and verified by reading it:
	 *  · `/v1/billing/plans` is the public plan ladder — the same information on
	 *    the pricing page, and it exposes only WHETHER a Stripe price is
	 *    configured, never the id.
	 *  · `/v1/billing/subscription` answers `{ signedIn: false }` with a 200 when
	 *    nobody is signed in, deliberately, because both surfaces ask before they
	 *    know. It checks `resolveOrgRole` before returning anything real.
	 *
	 * ⚠️ It resolves the session directly from `@quickengine/auth/server` rather
	 * than the injected dependency, so this sweep cannot simulate a valid session
	 * against it. Checked: only `billing-info-routes` and `auth-routes` do that,
	 * and neither is workspace-scoped, so nothing workspace-scoped escapes here.
	 */
	"/v1/billing",
];

const skipped = (path: string) =>
	NOT_WORKSPACE_SCOPED.some((prefix) => path.startsWith(prefix));

/** Fills `:id`-style segments so the router matches. */
const concrete = (path: string) =>
	path.replace(/:[A-Za-z]+/g, TARGET_WORKSPACE);

describe("tenant isolation", () => {
	// Built with the real registration, so this cannot drift from the app.
	let app: Hono<PlatformEnv>;

	const build = async () => {
		if (app) return app;
		const { registerAllRoutes } = await import("./register-routes");
		app = createApp(config, {
			logger: noopLogger,
			registerRoutes: (instance, logger) =>
				registerAllRoutes(instance, { dependencies, logger }),
		});
		return app;
	};

	it("registers routes to sweep", async () => {
		const instance = await build();
		const routes = instance.routes.filter((route) =>
			route.path.startsWith("/v1"),
		);
		// If this ever hits zero the sweep below passes vacuously, which is the one
		// way a test like this fails silently.
		expect(routes.length).toBeGreaterThan(50);
	});

	it("refuses every workspace-scoped route for a non-member", async () => {
		const instance = await build();
		const leaks: string[] = [];

		const seen = new Set<string>();
		for (const route of instance.routes) {
			if (!route.path.startsWith("/v1")) continue;
			if (skipped(route.path)) continue;
			const key = `${route.method} ${route.path}`;
			if (seen.has(key)) continue;
			seen.add(key);

			const method = route.method === "ALL" ? "GET" : route.method;
			const response = await instance.request(concrete(route.path), {
				method,
				headers: {
					"content-type": "application/json",
					"x-quickengine-workspace": TARGET_WORKSPACE,
					cookie: "session=valid",
				},
				body: method === "GET" || method === "DELETE" ? undefined : "{}",
			});

			// Anything that is not a success is acceptable — 401, 403, 404, 400 on a
			// body we did not bother to make valid. What must never happen is 2xx.
			if (response.status >= 200 && response.status < 300) {
				leaks.push(`${key} → ${response.status}`);
			}
		}

		expect(
			leaks,
			`these routes served a non-member:\n${leaks.join("\n")}`,
		).toEqual([]);
	});

	it("refuses every customer route when its key and session name different workspaces", async () => {
		const { registerAllRoutes } = await import("./register-routes");
		const instance = createApp(config, {
			logger: noopLogger,
			registerRoutes: (registered, logger) =>
				registerAllRoutes(registered, {
					dependencies: adversarialDependencies,
					logger,
				}),
		});
		const leaks: string[] = [];
		const seen = new Set<string>();

		for (const route of instance.routes) {
			if (!route.path.startsWith("/v1/customer/")) continue;
			// These two resolve public portal metadata from a host or slug and carry
			// no customer/session data. They intentionally precede customer auth.
			if (route.path.startsWith("/v1/customer/bootstrap")) continue;
			const key = `${route.method} ${route.path}`;
			if (seen.has(key)) continue;
			seen.add(key);

			const method = route.method === "ALL" ? "GET" : route.method;
			const response = await instance.request(concrete(route.path), {
				method,
				headers: {
					"content-type": "application/json",
					"x-quickengine-customer-session": "customer_workspace_b",
					"x-quickengine-publishable-key": "pk_workspace_a",
				},
				body: method === "GET" || method === "DELETE" ? undefined : "{}",
			});
			if (response.status >= 200 && response.status < 300) {
				leaks.push(`${key} → ${response.status}`);
			}
		}

		expect(
			leaks,
			`these customer routes accepted a cross-workspace session:\n${leaks.join("\n")}`,
		).toEqual([]);
	});

	it("refuses a server credential across every customer route", async () => {
		const { registerAllRoutes } = await import("./register-routes");
		const instance = createApp(config, {
			logger: noopLogger,
			registerRoutes: (registered, logger) =>
				registerAllRoutes(registered, {
					dependencies: adversarialDependencies,
					logger,
				}),
		});
		const leaks: string[] = [];
		const seen = new Set<string>();

		for (const route of instance.routes) {
			if (!route.path.startsWith("/v1/customer/")) continue;
			if (route.path.startsWith("/v1/customer/bootstrap")) continue;
			const key = `${route.method} ${route.path}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const method = route.method === "ALL" ? "GET" : route.method;
			const response = await instance.request(concrete(route.path), {
				method,
				headers: {
					"content-type": "application/json",
					"x-quickengine-publishable-key": "sk_workspace_a",
				},
				body: method === "GET" || method === "DELETE" ? undefined : "{}",
			});
			if (response.status >= 200 && response.status < 300) {
				leaks.push(`${key} → ${response.status}`);
			}
		}

		expect(
			leaks,
			`these customer routes accepted a server credential:\n${leaks.join("\n")}`,
		).toEqual([]);
	});

	it("refuses a valid API key paired with another workspace across operator routes", async () => {
		const { registerAllRoutes } = await import("./register-routes");
		const instance = createApp(config, {
			logger: noopLogger,
			registerRoutes: (registered, logger) =>
				registerAllRoutes(registered, {
					dependencies: adversarialDependencies,
					logger,
				}),
		});
		const leaks: string[] = [];
		const seen = new Set<string>();

		for (const route of instance.routes) {
			if (!route.path.startsWith("/v1")) continue;
			if (route.path.startsWith("/v1/customer/")) continue;
			if (skipped(route.path)) continue;
			const key = `${route.method} ${route.path}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const method = route.method === "ALL" ? "GET" : route.method;
			const response = await instance.request(concrete(route.path), {
				method,
				headers: {
					authorization: "Bearer sk_workspace_a",
					"content-type": "application/json",
					"x-quickengine-workspace": OTHER_WORKSPACE,
				},
				body: method === "GET" || method === "DELETE" ? undefined : "{}",
			});
			if (response.status >= 200 && response.status < 300) {
				leaks.push(`${key} → ${response.status}`);
			}
		}

		expect(
			leaks,
			`these operator routes accepted a cross-workspace key:\n${leaks.join("\n")}`,
		).toEqual([]);
	});
});
