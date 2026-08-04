import { API_HEADERS } from "@quickengine/api-contracts/headers";
import type { CacheProvider } from "@quickengine/cache";
import { portalBootstrap, portalBootstrapByHost } from "@quickengine/db";
import { listBookingsPage } from "@quickengine/mod-bookings";
import { listInvoicesPage } from "@quickengine/mod-invoicing";
import {
	getOrderDto,
	getReferralSummary,
	issueReferralCode,
	listOrdersPage,
} from "@quickengine/mod-orders";
import { getOrderPaymentSummary } from "@quickengine/mod-payments";
import {
	addToWishlist,
	createReview,
	listOwnReviews,
	listWishlist,
	mergeWishlist,
	ReviewError,
	removeFromWishlist,
	reviewInputSchema,
	WishlistError,
	wishlistItemInputSchema,
	wishlistMergeInputSchema,
} from "@quickengine/mod-products-services";
import { listShipments } from "@quickengine/mod-shipping";
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

type CustomerOrderLoaders = {
	getOrder: typeof getOrderDto;
	getPayment: typeof getOrderPaymentSummary;
	getShipments: typeof listShipments;
};

const customerOrderLoaders: CustomerOrderLoaders = {
	getOrder: getOrderDto,
	getPayment: getOrderPaymentSummary,
	getShipments: listShipments,
};

/**
 * Load one customer's order without ever accepting a client id from the request.
 *
 * Kept as a separately testable boundary because loading payment or shipment state
 * before ownership is established would turn an ordinary 404 into a cross-customer
 * data leak.
 */
export async function loadCustomerOrderDetail(
	input: { workspaceId: string; clientRecordId: string; orderId: string },
	loaders: CustomerOrderLoaders = customerOrderLoaders,
) {
	const order = await loaders.getOrder(input.workspaceId, input.orderId);
	if (!order || order.clientId !== input.clientRecordId) return null;

	const [payment, shipments] = await Promise.all([
		loaders.getPayment(input.workspaceId, input.orderId),
		loaders.getShipments(input.workspaceId, input.orderId),
	]);
	return {
		...order,
		payment,
		shipments: shipments.map((shipment) => ({
			id: shipment.id,
			status: shipment.status,
			carrier: shipment.carrier,
			serviceLevel: shipment.serviceLevel,
			trackingNumber: shipment.trackingNumber,
			trackingUrl: shipment.trackingUrl,
			shippedAt: shipment.shippedAt?.toISOString() ?? null,
			inTransitAt: shipment.inTransitAt?.toISOString() ?? null,
			deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
		})),
	};
}

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
	 * Boot the hosted portal from a URL slug alone.
	 *
	 * 🔴 The ONLY customer route with no publishable key, because it is what
	 * hands the key over. A visitor arriving at `portal.quickdash.xyz/gemsutopia`
	 * has no credential of any kind — this answers "whose shop is this?" so the
	 * page can render a name and a logo before anyone signs in.
	 *
	 * It replaces `VITE_CUSTOMER_PUBLISHABLE_KEY`, a build-time variable that
	 * pinned one deployment to one workspace. One build cannot embed a hundred
	 * customers' keys.
	 *
	 * ⚠️ Returning a key from an open endpoint is safe ONLY because a publishable
	 * key is public by construction: `issueApiKey` clamps it to the read-only
	 * capability allowlist, it cannot move money, and it is printed in page
	 * source wherever it is used. A secret key here would be a breach.
	 *
	 * An unknown slug and a disabled portal both answer 404, so this cannot be
	 * walked to inventory which businesses exist.
	 */
	/**
	 * Resolve a portal from the HOST the visitor typed.
	 *
	 * 🔴 The white-label path. A business pointing `account.gemsutopia.ca` at us
	 * gets its own portal there, and its customers never see a QuickDash address.
	 *
	 * ⚠️ Reads the ORIGIN header, not `Host`. A reverse proxy rewrites `Host` to
	 * its own upstream, so trusting it would resolve every custom-domain visit to
	 * whatever the proxy calls itself. `Origin` is set by the browser and survives
	 * the hop. Falls back to `Host` only for a direct request with no `Origin`,
	 * which is what a server-side render sends.
	 */
	app.get("/v1/customer/bootstrap-by-host", readLimit, async (c) => {
		const origin = c.req.header("origin");
		const host = origin ?? c.req.header("host") ?? "";
		const bootstrap = await portalBootstrapByHost(host);
		if (!bootstrap) {
			return respondError(
				c,
				"PORTAL_NOT_FOUND",
				"No portal is published at this address.",
				404,
			);
		}
		return respond(c, {
			workspaceId: bootstrap.workspaceId,
			portalSlug: bootstrap.portalSlug,
			publishableKey: bootstrap.publishableKey,
			brand: {
				name: bootstrap.name,
				supportEmail: bootstrap.supportEmail,
				logoUrl: bootstrap.logoUrl ?? null,
				faviconUrl: bootstrap.faviconUrl ?? null,
				tagline: bootstrap.tagline ?? null,
				accentColor: bootstrap.accentColor ?? null,
				websiteUrl: bootstrap.websiteUrl ?? null,
			},
		});
	});

	app.get("/v1/customer/bootstrap/:slug", readLimit, async (c) => {
		const bootstrap = await portalBootstrap(c.req.param("slug"));
		if (!bootstrap) {
			return respondError(
				c,
				"PORTAL_NOT_FOUND",
				"No portal is published at this address.",
				404,
			);
		}
		return respond(c, {
			workspaceId: bootstrap.workspaceId,
			publishableKey: bootstrap.publishableKey,
			brand: {
				name: bootstrap.name,
				supportEmail: bootstrap.supportEmail,
				logoUrl: bootstrap.logoUrl ?? null,
				faviconUrl: bootstrap.faviconUrl ?? null,
				tagline: bootstrap.tagline ?? null,
				accentColor: bootstrap.accentColor ?? null,
				websiteUrl: bootstrap.websiteUrl ?? null,
			},
		});
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

	/**
	 * One complete order owned by the signed-in customer.
	 *
	 * The client id is never accepted from the request. We load inside the
	 * workspace, then compare with the client record fixed by the customer
	 * session before reading payment or shipment state.
	 */
	app.get(
		"/v1/customer/orders/:id",
		readLimit,
		authorizeCustomer(dependencies, { requireSession: true, module: "orders" }),
		async (c) => {
			const { workspaceId, clientRecordId } = customerScope(c);
			if (!clientRecordId) {
				return respondError(c, "NOT_FOUND", "The order was not found.", 404);
			}
			const orderId = z.uuid().parse(c.req.param("id"));
			const order = await loadCustomerOrderDetail({
				workspaceId,
				clientRecordId,
				orderId,
			});
			if (!order) {
				return respondError(c, "NOT_FOUND", "The order was not found.", 404);
			}
			return respond(c, order);
		},
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
	// ── Wishlist — things this shopper wants to come back to ────────────────
	//
	// 🔴 Requires a session on every route. A wishlist belongs to a PERSON, and
	// the membership id it keys off only exists once somebody has signed in. A
	// guest's list lives in their own browser and arrives through `merge` below —
	// storing one server-side would mean minting an anonymous identity for every
	// visitor who taps a heart, which is a tracking cookie wearing a different
	// name.

	app.get(
		"/v1/customer/wishlist",
		readLimit,
		authorizeCustomer(dependencies, {
			requireSession: true,
			module: "products-services",
		}),
		async (c) => {
			const { workspaceCustomerId } = customerScope(c);
			if (!workspaceCustomerId) return respond(c, { items: [] });
			return respond(c, { items: await listWishlist(workspaceCustomerId) });
		},
	);

	app.post(
		"/v1/customer/wishlist",
		writeLimit,
		authorizeCustomer(dependencies, {
			requireSession: true,
			module: "products-services",
		}),
		async (c) => {
			const parsed = wishlistItemInputSchema.safeParse(
				await c.req.json().catch(() => ({})),
			);
			if (!parsed.success) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"Send a catalog item to save.",
					400,
					parsed.error.issues,
				);
			}
			const { workspaceId, workspaceCustomerId } = customerScope(c);
			if (!workspaceCustomerId) {
				return respondError(
					c,
					"AUTHENTICATION_REQUIRED",
					"Sign in first.",
					401,
				);
			}
			try {
				await addToWishlist({
					workspaceId,
					workspaceCustomerId,
					item: parsed.data,
				});
			} catch (error) {
				if (error instanceof WishlistError) {
					// One message whether the item is missing, archived, or belongs to
					// another shop — a saved-items endpoint should not confirm what
					// exists in somebody else's catalog.
					return respondError(c, "NOT_FOUND", error.message, 404);
				}
				throw error;
			}
			return respond(c, { saved: true }, 201);
		},
	);

	app.delete(
		"/v1/customer/wishlist/:catalogItemId",
		writeLimit,
		authorizeCustomer(dependencies, {
			requireSession: true,
			module: "products-services",
		}),
		async (c) => {
			const { workspaceCustomerId } = customerScope(c);
			if (!workspaceCustomerId) {
				return respondError(
					c,
					"AUTHENTICATION_REQUIRED",
					"Sign in first.",
					401,
				);
			}
			// Removing something absent is success. A double-tapped heart must not
			// produce an error the shopper has to understand.
			await removeFromWishlist({
				workspaceCustomerId,
				catalogItemId: c.req.param("catalogItemId"),
			});
			return respond(c, { removed: true });
		},
	);

	/**
	 * Fold a guest's browser-held list into their account.
	 *
	 * Called once, right after sign-in. Additive: somebody who saved three things
	 * signed out and already had five ends with eight, because replacing the list
	 * would throw away what they saved on another device.
	 */
	app.post(
		"/v1/customer/wishlist/merge",
		writeLimit,
		authorizeCustomer(dependencies, {
			requireSession: true,
			module: "products-services",
		}),
		async (c) => {
			const parsed = wishlistMergeInputSchema.safeParse(
				await c.req.json().catch(() => ({})),
			);
			if (!parsed.success) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"Send the saved items to merge.",
					400,
					parsed.error.issues,
				);
			}
			const { workspaceId, workspaceCustomerId } = customerScope(c);
			if (!workspaceCustomerId) {
				return respondError(
					c,
					"AUTHENTICATION_REQUIRED",
					"Sign in first.",
					401,
				);
			}
			return respond(
				c,
				await mergeWishlist({
					workspaceId,
					workspaceCustomerId,
					items: parsed.data.items,
				}),
			);
		},
	);
	// ── Referrals — a customer bringing another customer ─────────────────────

	/**
	 * This shopper's own referral code, created on first ask.
	 *
	 * ⚠️ Requires a session AND a client record. A customer who has signed in but
	 * never ordered has no client record yet, and a referral code has to belong to
	 * something an order can point at.
	 */
	app.post(
		"/v1/customer/referral-code",
		writeLimit,
		authorizeCustomer(dependencies, {
			requireSession: true,
			module: "orders",
		}),
		async (c) => {
			const { workspaceId, clientRecordId } = customerScope(c);
			if (!clientRecordId) {
				return respondError(
					c,
					"NOT_FOUND",
					"You'll have a referral code once you've placed an order.",
					404,
				);
			}
			return respond(
				c,
				await issueReferralCode({ workspaceId, clientRecordId }),
			);
		},
	);

	/** What this shopper's code has earned. Null before they have one. */
	app.get(
		"/v1/customer/referral-code",
		readLimit,
		authorizeCustomer(dependencies, {
			requireSession: true,
			module: "orders",
		}),
		async (c) => {
			const { workspaceId, clientRecordId } = customerScope(c);
			if (!clientRecordId) return respond(c, { referral: null });
			const summary = await getReferralSummary({ workspaceId, clientRecordId });
			return respond(c, {
				referral: summary
					? {
							code: summary.code,
							totalReferrals: summary.totalReferrals,
							totalEarnedCents: summary.totalEarnedCents,
						}
					: null,
			});
		},
	);
	// ── Reviews — written by a customer, published by the operator ───────────

	/**
	 * Leave a review.
	 *
	 * 🔴 Always created `pending`. There is no path here that publishes, which is
	 * the whole point of the moderation queue.
	 */
	app.post(
		"/v1/customer/reviews",
		writeLimit,
		authorizeCustomer(dependencies, {
			requireSession: true,
			module: "products-services",
		}),
		async (c) => {
			const parsed = reviewInputSchema.safeParse(
				await c.req.json().catch(() => ({})),
			);
			if (!parsed.success) {
				return respondError(
					c,
					"VALIDATION_ERROR",
					"A review needs an item and a rating from 1 to 5.",
					400,
					parsed.error.issues,
				);
			}
			const { workspaceId, clientRecordId } = customerScope(c);
			if (!clientRecordId) {
				return respondError(
					c,
					"NOT_FOUND",
					"You can review something once you've ordered from this business.",
					404,
				);
			}
			try {
				const created = await createReview({
					workspaceId,
					clientRecordId,
					review: parsed.data,
				});
				// 201 with the status, so a storefront can say "thanks, it's awaiting
				// approval" rather than implying it is already live.
				return respond(c, created, 201);
			} catch (error) {
				if (error instanceof ReviewError) {
					return respondError(
						c,
						error.code === "ALREADY_REVIEWED" ? "CONFLICT" : "NOT_FOUND",
						error.message,
						error.code === "ALREADY_REVIEWED" ? 409 : 404,
					);
				}
				throw error;
			}
		},
	);

	/**
	 * This customer's own reviews, including ones still awaiting a decision.
	 *
	 * ⚠️ Shows `status`. Somebody who left a review and cannot find it deserves
	 * to know it is pending rather than assuming it was thrown away.
	 */
	app.get(
		"/v1/customer/reviews",
		readLimit,
		authorizeCustomer(dependencies, {
			requireSession: true,
			module: "products-services",
		}),
		async (c) => {
			const { workspaceId, clientRecordId } = customerScope(c);
			if (!clientRecordId) return respond(c, { items: [] });
			return respond(c, {
				items: await listOwnReviews(workspaceId, clientRecordId),
			});
		},
	);
}
