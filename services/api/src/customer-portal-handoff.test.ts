import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { CacheProvider } from "@quickengine/cache";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { CustomerAuthDependencies } from "./customer-routes";
import { registerCustomerRoutes } from "./customer-routes";
import { noopLogger } from "./logger";
import type {
	PlatformDependencies,
	PlatformEnv,
	WorkspaceResolution,
} from "./platform-types";

/**
 * Storefront → portal handoff, exercised through the real routes.
 *
 * The point of this feature is that a shopper who signed in on a storefront does
 * not sign in again at the portal — WITHOUT the two surfaces sharing a session
 * token. Everything below is a way that could go wrong and hand somebody a
 * session they should not have.
 *
 * DB_RULES rule 5: these run the registered handlers. Nothing retypes the logic
 * into a probe.
 */

// Hex only — DB_RULES rule 2. A `g` or an `s` in a uuid makes Postgres fail with
// an error that reads like a code bug rather than a bad fixture.
const WORKSPACE_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const WORKSPACE_B = "bbbbbbbb-0000-4000-8000-00000000000b";

const workspaceFor = (id: string): WorkspaceResolution => ({
	enabledModuleIds: ["orders"],
	organizationId: `org-${id}`,
	ownerId: `owner-${id}`,
	workspace: { businessType: "commerce", id, name: "Gemsutopia", slug: "gems" },
});

const noopCache = {
	get: async () => null,
	set: async () => {},
	increment: async () => 1,
	delete: async () => {},
} as unknown as CacheProvider;

function platform(): PlatformDependencies {
	return {
		getSession: async () => null,
		getWorkspaceForUser: async () => null,
		getWorkspaceForKey: async (id: string) => workspaceFor(id),
		// `pk_a` belongs to workspace A, `pk_b` to workspace B. Which key the portal
		// presents is what decides the workspace a ticket may be redeemed into.
		verifyApiKey: async (raw: string) =>
			raw === "pk_a"
				? {
						allowedOrigins: [],
						id: "key_a",
						type: "publishable",
						workspaceId: WORKSPACE_A,
					}
				: raw === "pk_b"
					? {
							allowedOrigins: [],
							id: "key_b",
							type: "publishable",
							workspaceId: WORKSPACE_B,
						}
					: null,
		resolveCustomerSession: async (token: string) =>
			token === "session_a"
				? {
						email: "alice@example.test",
						workspaceCustomerId: "wc_1",
						workspaceId: WORKSPACE_A,
						identityId: "id_1",
						clientRecordId: "client_1",
					}
				: null,
		logger: noopLogger,
	} as unknown as PlatformDependencies;
}

/**
 * A handoff store with the two properties that matter: one redemption per
 * ticket, and the membership it was minted for.
 *
 * Modelled rather than mocked, so "spent" behaves the way the conditional UPDATE
 * in `consumePortalHandoff` behaves — the second caller gets nothing.
 */
function authWith(overrides: Partial<CustomerAuthDependencies> = {}) {
	const tickets = new Map<
		string,
		{ workspaceCustomerId: string; workspaceId: string; audience: string }
	>();
	let minted = 0;
	let sessions = 0;

	const auth: CustomerAuthDependencies = {
		sendSignInLink: async () => {},
		createLoginToken: async () => ({ token: "t", expiresAt: new Date() }),
		consumeLoginToken: async () => null,
		findOrCreateIdentity: async () => ({ id: "id_1" }),
		bindMembership: async () => ({
			workspaceCustomerId: "wc_1",
			clientRecordId: "client_1",
		}),
		createCustomerSession: async () => {
			sessions += 1;
			return {
				token: `portal_session_${sessions}`,
				expiresAt: new Date(Date.now() + 86_400_000),
			};
		},
		revokeCustomerSession: async () => {},
		createPortalHandoff: async ({ workspaceCustomerId, audience }) => {
			minted += 1;
			const token = `handoff_${minted}_padded_to_sixteen_chars`;
			tickets.set(token, {
				workspaceCustomerId,
				workspaceId: WORKSPACE_A,
				audience,
			});
			return { token, expiresAt: new Date(Date.now() + 60_000) };
		},
		consumePortalHandoff: async ({ token, audience }) => {
			const ticket = tickets.get(token);
			if (!ticket || ticket.audience !== audience) return null;
			// Single use: spending it removes it, so a replay finds nothing.
			tickets.delete(token);
			return {
				workspaceCustomerId: ticket.workspaceCustomerId,
				workspaceId: ticket.workspaceId,
			};
		},
		...overrides,
	};

	const app = new Hono<PlatformEnv>();
	registerCustomerRoutes(app, {
		cache: noopCache,
		logger: noopLogger,
		platform: platform(),
		auth,
	});
	return app;
}

const asStorefront = {
	[API_HEADERS.publishableKey]: "pk_a",
	[API_HEADERS.customerSession]: "session_a",
	"content-type": "application/json",
};

const mint = (app: Hono<PlatformEnv>) =>
	app.request("/v1/customer/portal-handoff", {
		method: "POST",
		headers: asStorefront,
	});

const redeem = (app: Hono<PlatformEnv>, token: string, key = "pk_a") =>
	app.request("/v1/customer/portal-handoff/redeem", {
		method: "POST",
		headers: {
			[API_HEADERS.publishableKey]: key,
			"content-type": "application/json",
		},
		body: JSON.stringify({ token }),
	});

describe("storefront to portal handoff", () => {
	it("refuses to mint without a customer session", async () => {
		// A publishable key is printed in page source. If it alone could mint a
		// ticket, anyone could read it and open a session as somebody.
		const res = await authWith().request("/v1/customer/portal-handoff", {
			method: "POST",
			headers: { [API_HEADERS.publishableKey]: "pk_a" },
		});
		expect(res.status).toBe(401);
	});

	it("mints a ticket that is not the storefront's session token", async () => {
		const res = await mint(authWith());
		expect(res.status).toBe(200);
		const { data } = await res.json();
		// 🔴 The whole point. If these were ever equal, the storefront session would
		// be travelling across origins in a URL.
		expect(data.token).not.toBe("session_a");
		expect(data.expiresAt).toBeTruthy();
	});

	it("trades a ticket for a session that is not the storefront's", async () => {
		const app = authWith();
		const { data: ticket } = await (await mint(app)).json();

		const res = await redeem(app, ticket.token);
		expect(res.status).toBe(200);
		const { data } = await res.json();
		expect(data.token).toBe("portal_session_1");
		expect(data.token).not.toBe(ticket.token);
		expect(data.token).not.toBe("session_a");
	});

	it("🔴 refuses a ticket that was already spent", async () => {
		// A handoff token rides in a URL, so it lands in browser history, any
		// `Referer` the next navigation sends, and every proxy log on the way. The
		// only thing that makes that survivable is that it works exactly once.
		const app = authWith();
		const { data: ticket } = await (await mint(app)).json();

		expect((await redeem(app, ticket.token)).status).toBe(200);

		const replay = await redeem(app, ticket.token);
		expect(replay.status).toBe(401);
		expect((await replay.json()).error.code).toBe("SESSION_EXPIRED");
	});

	it("🔴 refuses a ticket redeemed at ANOTHER workspace's portal", async () => {
		// Both credentials are individually genuine: a real ticket from business A,
		// a real publishable key from business B. Only their disagreement reveals
		// it, and honouring it would mint a cross-tenant session in one request.
		const app = authWith();
		const { data: ticket } = await (await mint(app)).json();

		const res = await redeem(app, ticket.token, "pk_b");
		expect(res.status).toBe(401);
		expect((await res.json()).error.code).toBe("SESSION_EXPIRED");
	});

	it("answers an unknown ticket exactly like a spent one", async () => {
		// Distinguishing them tells an attacker which tickets once existed, which
		// turns the endpoint into an oracle for guessing.
		const app = authWith();
		const unknown = await redeem(app, "handoff_never_existed_at_all");
		expect(unknown.status).toBe(401);
		expect((await unknown.json()).error.code).toBe("SESSION_EXPIRED");
	});

	it("rejects a request with no token", async () => {
		const res = await authWith().request("/v1/customer/portal-handoff/redeem", {
			method: "POST",
			headers: {
				[API_HEADERS.publishableKey]: "pk_a",
				"content-type": "application/json",
			},
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});
});
