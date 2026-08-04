import { API_HEADERS } from "@quickengine/api-contracts/headers";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { authorizeCustomer } from "./customer-authorize";
import { noopLogger } from "./logger";
import type {
	PlatformDependencies,
	PlatformEnv,
	WorkspaceResolution,
} from "./platform-types";
import { respond } from "./respond";

/**
 * The customer boundary, exercised through the real middleware.
 *
 * This is the only surface a stranger's browser is invited to call, and the
 * only place two of our users' customer lists are kept apart by code rather
 * than by a database boundary. Every case below is a way that separation could
 * fail.
 *
 * DB_RULES rule 5: these run the actual middleware. Nothing here retypes its
 * logic into a probe.
 */

// Hex only — DB_RULES rule 2. `s`, `l` and `m` are not hex digits, and Postgres
// rejects ids containing them with an error that reads like a code bug.
const WORKSPACE_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const WORKSPACE_B = "bbbbbbbb-0000-4000-8000-00000000000b";

const workspaceFor = (id: string): WorkspaceResolution => ({
	enabledModuleIds: ["orders"],
	organizationId: `org-${id}`,
	ownerId: `owner-${id}`,
	workspace: { businessType: "commerce", id, name: "Gemsutopia", slug: "gems" },
});

function deps(
	overrides: Partial<PlatformDependencies> = {},
): PlatformDependencies {
	return {
		getSession: async () => null,
		getWorkspaceForUser: async () => null,
		getWorkspaceForKey: async (id) => workspaceFor(id),
		verifyApiKey: async (raw) =>
			raw.startsWith("pk_")
				? {
						allowedOrigins: [],
						id: "key_1",
						type: "publishable",
						workspaceId: WORKSPACE_A,
					}
				: raw.startsWith("sk_")
					? {
							allowedOrigins: [],
							id: "key_2",
							type: "secret",
							workspaceId: WORKSPACE_A,
						}
					: null,
		resolveCustomerSession: async (token) =>
			token === "session_a"
				? {
						email: "alice@example.test",
						workspaceCustomerId: "wc_1",
						workspaceId: WORKSPACE_A,
						identityId: "id_1",
						clientRecordId: "client_1",
					}
				: token === "session_b"
					? {
							email: "bob@example.test",
							workspaceCustomerId: "wc_2",
							workspaceId: WORKSPACE_B,
							identityId: "id_2",
							clientRecordId: "client_2",
						}
					: null,
		logger: noopLogger,
		...overrides,
	} as PlatformDependencies;
}

function appWith(dependencies: PlatformDependencies) {
	const app = new Hono<PlatformEnv>();
	app.get(
		"/public",
		authorizeCustomer(dependencies, { requireSession: false }),
		(c) =>
			respond(c, { scope: c.get("customer").customer?.clientRecordId ?? null }),
	);
	app.get(
		"/private",
		authorizeCustomer(dependencies, { requireSession: true }),
		(c) =>
			respond(c, { scope: c.get("customer").customer?.clientRecordId ?? null }),
	);
	return app;
}

const pk = { [API_HEADERS.publishableKey]: "pk_live_1" };
const sk = { [API_HEADERS.publishableKey]: "sk_live_1" };

describe("customer boundary", () => {
	it("refuses a request with no publishable key", async () => {
		const res = await appWith(deps()).request("/public");
		expect(res.status).toBe(401);
	});

	it("refuses a SECRET key", async () => {
		// A secret key carries an operator's full authority. Accepting one here
		// because it is "more privileged" would turn a leaked server key into a
		// reader of every customer's records through a public endpoint.
		const res = await appWith(deps()).request("/public", { headers: sk });
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe("CREDENTIAL_CHANNEL_MISMATCH");
	});

	it("allows a public route with a key and no session", async () => {
		const res = await appWith(deps()).request("/public", { headers: pk });
		expect(res.status).toBe(200);
		expect((await res.json()).data.scope).toBeNull();
	});

	it("refuses a private route with a key but no session", async () => {
		const res = await appWith(deps()).request("/private", { headers: pk });
		expect(res.status).toBe(401);
	});

	it("scopes a signed-in customer to their own client record", async () => {
		const res = await appWith(deps()).request("/private", {
			headers: { ...pk, [API_HEADERS.customerSession]: "session_a" },
		});
		expect(res.status).toBe(200);
		expect((await res.json()).data.scope).toBe("client_1");
	});

	it("🔴 refuses a session minted for a DIFFERENT workspace", async () => {
		// The attack this exists for: a valid session from storefront B presented
		// to storefront A. Both credentials are individually genuine — only their
		// disagreement reveals it. Answering 2xx here would be a cross-tenant read.
		const res = await appWith(deps()).request("/private", {
			headers: { ...pk, [API_HEADERS.customerSession]: "session_b" },
		});
		expect(res.status).toBe(403);
		expect((await res.json()).error.code).toBe("SESSION_WORKSPACE_MISMATCH");
	});

	it("refuses an unknown or revoked session rather than falling back to anonymous", async () => {
		// Silently downgrading a presented-but-invalid token to "anonymous" would
		// serve a public response to someone who believes they are signed in.
		const res = await appWith(deps()).request("/private", {
			headers: { ...pk, [API_HEADERS.customerSession]: "nope" },
		});
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe("SESSION_EXPIRED");
	});

	it("refuses a presented session when the app has no resolver wired", async () => {
		const res = await appWith(
			deps({ resolveCustomerSession: undefined }),
		).request("/private", {
			headers: { ...pk, [API_HEADERS.customerSession]: "session_a" },
		});
		expect(res.status).toBe(401);
	});

	it("🔴 never sets the operator context", async () => {
		// THE WALL. `authorized` and `customer` are disjoint slots. If this
		// middleware ever populated `authorized`, every operator route would become
		// reachable by any shopper holding a publishable key.
		const app = new Hono<PlatformEnv>();
		app.get("/leak", authorizeCustomer(deps(), { requireSession: true }), (c) =>
			respond(c, { operator: c.get("authorized") ?? null }),
		);
		const res = await app.request("/leak", {
			headers: { ...pk, [API_HEADERS.customerSession]: "session_a" },
		});
		expect(res.status).toBe(200);
		expect((await res.json()).data.operator).toBeNull();
	});

	it("refuses a route whose module the workspace has not enabled", async () => {
		const app = new Hono<PlatformEnv>();
		app.get(
			"/bookings",
			authorizeCustomer(deps(), { requireSession: false, module: "bookings" }),
			(c) => respond(c, { ok: true }),
		);
		const res = await app.request("/bookings", { headers: pk });
		expect(res.status).toBe(403);
		expect((await res.json()).error.code).toBe("MODULE_DISABLED");
	});
});
