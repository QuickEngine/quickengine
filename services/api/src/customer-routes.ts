import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { CacheProvider } from "@quickengine/cache";
import { listBookingsPage } from "@quickengine/mod-bookings";
import { listInvoicesPage } from "@quickengine/mod-invoicing";
import { listOrdersPage } from "@quickengine/mod-orders";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { authorizeCustomer, customerScope } from "./customer-authorize";
import type { ApiLogger } from "./logger";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { createRateLimit, RATE_LIMIT_POLICIES } from "./rate-limit";
import { respond, respondError } from "./respond";

/**
 * `/v1/customer/*` — the surface our USERS' USERS reach.
 *
 * A shopper, a massage client, an agency's client, a student. Every route here
 * is called from a public storefront, so every one assumes the caller is
 * hostile until the boundary says otherwise.
 *
 * See `customer-authorize.ts` for the wall between this and the operator API.
 */

/** What a workspace must supply for its customers to sign in and be emailed. */
export type CustomerAuthDependencies = {
	/**
	 * Send the sign-in link.
	 *
	 * Supplied by the app rather than called directly so this file has no
	 * dependency on an email provider, and so tests can assert a link was sent
	 * without a mail server.
	 */
	sendSignInLink(input: {
		workspaceId: string;
		workspaceName: string;
		email: string;
		token: string;
		expiresInMinutes: number;
	}): Promise<void>;

	createLoginToken(input: {
		workspaceId: string;
		email: string;
	}): Promise<{ token: string; expiresAt: Date }>;

	consumeLoginToken(input: {
		workspaceId: string;
		token: string;
	}): Promise<{ email: string } | null>;

	findOrCreateIdentity(email: string): Promise<{ id: string }>;

	bindMembership(input: {
		workspaceId: string;
		identityId: string;
		email: string;
	}): Promise<{ workspaceCustomerId: string; clientRecordId: string | null }>;

	createCustomerSession(
		workspaceCustomerId: string,
	): Promise<{ token: string; expiresAt: Date }>;

	revokeCustomerSession(token: string): Promise<void>;
};

const requestLinkSchema = z.object({ email: z.email().max(320) });
const verifySchema = z.object({ token: z.string().min(16).max(512) });

export function registerCustomerRoutes(
	app: Hono<PlatformEnv>,
	options: {
		cache: CacheProvider;
		logger: ApiLogger;
		platform: PlatformDependencies;
		auth: CustomerAuthDependencies;
	},
) {
	const dependencies = options.platform;
	const auth = options.auth;

	// Scoped separately from the operator limiters. This surface is public and
	// unauthenticated at its edges, so it is the one that gets scraped — sharing
	// a bucket would let a storefront's traffic exhaust its operator's.
	const readLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.read,
		scope: "customer.read",
	});
	const writeLimit = createRateLimit({
		cache: options.cache,
		logger: options.logger,
		policy: RATE_LIMIT_POLICIES.write,
		scope: "customer.write",
	});
	/**
	 * The workspace a publishable key belongs to, and what it has enabled.
	 *
	 * Drives the portal's navigation the same way `workspace_modules` drives
	 * QuickDash's sidebar — a gem shop shows Orders, a clinic shows Bookings.
	 * Public, because the portal needs it before anybody has signed in.
	 *
	 * ⚠️ Deliberately thin. This answers to an unauthenticated caller holding a
	 * key that is printed in page source, so it carries the workspace's public
	 * identity and nothing about its operators, billing or customers.
	 */
	app.get(
		"/v1/customer/context",
		readLimit,
		authorizeCustomer(dependencies, { requireSession: false }),
		(c) => {
			const { workspace, customer } = c.get("customer");
			return respond(c, {
				workspace: {
					name: workspace.workspace.name,
					slug: workspace.workspace.slug,
				},
				modules: workspace.enabledModuleIds,
				signedIn: customer !== null,
			});
		},
	);

	/**
	 * Request a sign-in link.
	 *
	 * 🔴 ALWAYS answers 202, whether or not the address is known. Any difference
	 * — status, body, timing branch — turns a public storefront's sign-in form
	 * into an oracle for "is this person a customer of this business?" That is
	 * exactly the enumeration hole that lets one of our users' competitors
	 * inventory their customer list, and it is also what makes global identity
	 * safe: nobody can probe one workspace to learn about another.
	 *
	 * Rate limited on the WRITE policy despite reading nothing, because the work
	 * it triggers is an outbound email and the abuse case is using someone else's
	 * storefront to spam a third party.
	 */
	app.post(
		"/v1/customer/auth/request-link",
		writeLimit,
		authorizeCustomer(dependencies, { requireSession: false }),
		async (c) => {
			const parsed = requestLinkSchema.safeParse(await c.req.json());
			if (!parsed.success) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"A valid email address is required.",
					400,
					parsed.error.issues,
				);
			}

			const { workspaceId, workspace } = c.get("customer");
			const { token, expiresAt } = await auth.createLoginToken({
				workspaceId,
				email: parsed.data.email,
			});

			// 🔴 A DELIVERY FAILURE MUST NOT CHANGE THE ANSWER.
			//
			// Letting this throw produced a 500 while a deliverable address produced
			// a 202 — which re-opens the enumeration hole this endpoint exists to
			// close, using the mail provider as the oracle instead of the database.
			// It also turned a transient provider outage into a broken sign-in.
			//
			// The token is already persisted, so a caller can simply request
			// another. Logged at error level because silent mail failure is
			// otherwise invisible until somebody complains they never got a link.
			try {
				await auth.sendSignInLink({
					workspaceId,
					workspaceName: workspace.workspace.name,
					email: parsed.data.email,
					token,
					expiresInMinutes: Math.max(
						1,
						Math.round((expiresAt.getTime() - Date.now()) / 60_000),
					),
				});
			} catch (error) {
				options.logger.error("customer.sign_in_link_failed", {
					error,
					workspaceId,
				});
			}

			// No body. Anything returned here is another channel to probe.
			return respond(c, { sent: true }, 202);
		},
	);

	/**
	 * Redeem a link and receive a session.
	 *
	 * The session token is returned in the BODY, not set as a cookie. The portal
	 * is served from our domain while the storefront is on the workspace's, so a
	 * cookie could not be read by both; a bearer token in a header works from
	 * either. It also means no CSRF surface, because nothing is sent
	 * automatically by the browser.
	 */
	app.post(
		"/v1/customer/auth/verify",
		writeLimit,
		authorizeCustomer(dependencies, { requireSession: false }),
		async (c) => {
			const parsed = verifySchema.safeParse(await c.req.json());
			if (!parsed.success) {
				return respondError(c, "VALIDATION_ERROR", "A token is required.", 400);
			}

			const { workspaceId } = c.get("customer");
			const consumed = await auth.consumeLoginToken({
				workspaceId,
				token: parsed.data.token,
			});

			// Expired, already used, unknown, or minted for another workspace — all
			// answered identically. Distinguishing them tells an attacker which
			// tokens once existed.
			if (!consumed) {
				return respondError(
					c,
					"SESSION_EXPIRED",
					"This sign-in link is no longer valid. Request a new one.",
					401,
				);
			}

			const identity = await auth.findOrCreateIdentity(consumed.email);
			const membership = await auth.bindMembership({
				workspaceId,
				identityId: identity.id,
				email: consumed.email,
			});
			const session = await auth.createCustomerSession(
				membership.workspaceCustomerId,
			);

			return respond(c, {
				token: session.token,
				expiresAt: session.expiresAt.toISOString(),
			});
		},
	);

	/** Who the presented session belongs to. */
	app.get(
		"/v1/customer/auth/me",
		readLimit,
		authorizeCustomer(dependencies, { requireSession: true }),
		(c) => {
			const { customer } = c.get("customer");
			if (!customer) {
				return respondError(c, "AUTHENTICATION_REQUIRED", "Sign in.", 401);
			}
			// The identity id is deliberately absent. It is the one value that spans
			// workspaces, and nothing a storefront does needs it.
			return respond(c, {
				customerId: customer.workspaceCustomerId,
				hasRecords: customer.clientRecordId !== null,
			});
		},
	);

	/**
	 * A customer's own records.
	 *
	 * 🔴 EVERY one of these goes through `customerScope`, and none of them reads
	 * a client id from the request. There is no parameter to get wrong and no way
	 * for a caller to express "somebody else's orders" — the filter comes from
	 * the session, in middleware, or the request never reaches the handler.
	 *
	 * A verified customer with no client record gets an EMPTY list, never an
	 * unfiltered one. That distinction is the difference between "you have no
	 * orders" and "here is everyone's".
	 *
	 * Each is gated on its module, so a gem shop's portal has no bookings
	 * endpoint at all rather than an empty one.
	 */
	const customerList =
		(
			load: (
				workspaceId: string,
				query: Record<string, unknown>,
			) => Promise<unknown>,
		) =>
		async (c: Context<PlatformEnv>) => {
			const { workspaceId, clientRecordId } = customerScope(c);
			if (!clientRecordId) return respond(c, { items: [], page: null });
			const query = c.req.query();
			return respond(
				c,
				await load(workspaceId, { ...query, clientId: clientRecordId }),
			);
		};

	app.get(
		"/v1/customer/orders",
		readLimit,
		authorizeCustomer(dependencies, { requireSession: true, module: "orders" }),
		customerList(listOrdersPage),
	);

	app.get(
		"/v1/customer/bookings",
		readLimit,
		authorizeCustomer(dependencies, {
			requireSession: true,
			module: "bookings",
		}),
		customerList(listBookingsPage),
	);

	app.get(
		"/v1/customer/invoices",
		readLimit,
		authorizeCustomer(dependencies, {
			requireSession: true,
			module: "invoicing",
		}),
		customerList(listInvoicesPage),
	);

	/** Sign out. Idempotent — a token already revoked answers the same. */
	app.post(
		"/v1/customer/auth/sign-out",
		writeLimit,
		authorizeCustomer(dependencies, { requireSession: true }),
		async (c) => {
			const raw = c.req.header(API_HEADERS.customerSession)?.trim();
			if (raw) await auth.revokeCustomerSession(raw);
			return respond(c, { signedOut: true });
		},
	);
}
