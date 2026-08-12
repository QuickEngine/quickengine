/**
 * The Customer API client.
 *
 * One deployment serves every workspace. Which workspace a visitor is in comes
 * from the URL, and everything else — the publishable key, the business's name,
 * its logo — is fetched at runtime from `/v1/customer/bootstrap/:slug`.
 *
 * 🔴 There is no build-time key. `VITE_CUSTOMER_PUBLISHABLE_KEY` used to pin the
 * entire deployment to a single workspace, because one build cannot embed a
 * hundred customers' keys.
 */

export type PortalBrand = {
	name: string;
	supportEmail: string;
	logoUrl: string | null;
	faviconUrl: string | null;
	tagline: string | null;
	accentColor: string | null;
	websiteUrl: string | null;
};

export type PortalBootstrap = {
	workspaceId: string;
	publishableKey: string | null;
	brand: PortalBrand;
};

/**
 * The resolved portal for this page load.
 *
 * Module-level because `call()` needs the key synchronously on every request,
 * and threading it through would put a credential in a dozen component
 * signatures. Set once by the route loader, before anything renders.
 */
let current: (PortalBootstrap & { slug: string }) | null = null;

export function currentPortal() {
	return current;
}

/**
 * Resolve a portal from its URL slug.
 *
 * The one call carrying no publishable key, because it is the call that fetches
 * one. A 404 means no portal is published at this address.
 */
export async function bootstrapPortal(slug: string): Promise<PortalBootstrap> {
	const response = await fetch(
		`/v1/customer/bootstrap/${encodeURIComponent(slug)}`,
	);
	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		throw new CustomerApiError(
			payload?.error?.code ?? "PORTAL_NOT_FOUND",
			payload?.error?.message ?? "No portal is published at this address.",
			response.status,
		);
	}

	current = { ...(payload.data as PortalBootstrap), slug };
	applyBranding(current.brand);
	return current;
}

/**
 * Resolve a portal from the address the visitor arrived at.
 *
 * A business on its own domain has no slug in the URL — `account.theirshop.com`
 * is the whole identifier — so the host is what names the workspace. The API
 * answers 404 for an unknown host exactly as it does for an unknown slug, so
 * this tells a caller nothing they did not already know by typing the address.
 *
 * 🔴 The workspace's own slug still scopes the stored session. Reaching one
 * business through its custom domain and through `/<slug>` must land on ONE
 * session, or a customer signs in twice and appears signed out by changing
 * address.
 */
export async function bootstrapPortalByHost(): Promise<PortalBootstrap> {
	const response = await fetch("/v1/customer/bootstrap-by-host");
	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		throw new CustomerApiError(
			payload?.error?.code ?? "PORTAL_NOT_FOUND",
			payload?.error?.message ?? "No portal is published at this address.",
			response.status,
		);
	}

	const data = payload.data as PortalBootstrap & { portalSlug?: string | null };
	current = { ...data, slug: data.portalSlug ?? window.location.host };
	applyBranding(current.brand);
	return current;
}

/**
 * Put the business's identity on the page itself.
 *
 * ⚠️ Done at RUNTIME because a static `index.html` ships one title and one icon,
 * and this deployment serves every workspace. A visitor sees the default for one
 * frame before this runs; there is no avoiding that short of a build per
 * customer or server-side rendering.
 */
function applyBranding(brand: PortalBrand) {
	document.title = brand.name;

	if (brand.faviconUrl) {
		// Reuse the existing element. Appending a second leaves the browser to
		// choose, and they do not all choose the last one.
		const existing =
			document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
		const link = existing ?? document.createElement("link");
		link.rel = "icon";
		link.href = brand.faviconUrl;
		if (!existing) document.head.appendChild(link);
	}

	if (brand.accentColor) {
		document.documentElement.style.setProperty(
			"--portal-accent",
			brand.accentColor,
		);
	}
}

/**
 * Where this browser keeps its session for THIS portal.
 *
 * 🔴 Scoped by slug. One shared key means a person visiting two businesses'
 * portals in the same browser sends the first one's session to the second. The
 * API refuses it with `SESSION_WORKSPACE_MISMATCH`, correctly — but the visitor
 * just sees a portal that will not let them in.
 */
function sessionKey() {
	return `quickdash-customer-session:${current?.slug ?? "unknown"}`;
}

export const session = {
	get: () => localStorage.getItem(sessionKey()),
	set: (token: string) => localStorage.setItem(sessionKey(), token),
	clear: () => localStorage.removeItem(sessionKey()),
};

export class CustomerApiError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

async function call<T>(
	path: string,
	init: RequestInit & { signOutOnExpiry?: boolean } = {},
): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set("QuickEngine-Publishable-Key", current?.publishableKey ?? "");
	if (init.body) headers.set("Content-Type", "application/json");

	// The session travels in a header, not a cookie. The portal is on our domain
	// while storefronts are on their own, so a cookie could not serve both — and
	// nothing sent automatically by the browser means no CSRF surface.
	const token = session.get();
	if (token) headers.set("QuickEngine-Customer-Session", token);

	const response = await fetch(path, { ...init, headers });
	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		const code = payload?.error?.code ?? "INTERNAL_ERROR";
		// A dead session is cleared here rather than by every caller. Leaving it in
		// storage means every subsequent request fails the same way and the portal
		// looks broken instead of signed out.
		//
		// 🔴 NOT on `verify`. That endpoint answers SESSION_EXPIRED for a spent
		// SIGN-IN LINK, which is a different thing entirely from a dead session —
		// and clearing on it wiped the session the same request had just created.
		// With StrictMode double-invoking effects in development, the second
		// attempt at a single-use link deleted the credential the first attempt
		// stored, producing an endless sign-in loop.
		if (code === "SESSION_EXPIRED" && init.signOutOnExpiry !== false) {
			session.clear();
		}
		throw new CustomerApiError(
			code,
			payload?.error?.message ?? "Something went wrong.",
			response.status,
		);
	}

	return payload.data as T;
}

export type CustomerContext = {
	workspace: { name: string; slug: string | null };
	modules: string[];
	signedIn: boolean;
};

export type PortalConversation = {
	id: string;
	subject: string;
	status: "open" | "closed";
	lastMessageAt: string;
	messages?: Array<{
		id: string;
		sender: "customer" | "operator" | "system";
		body: string;
		createdAt: string;
	}>;
};

export const customerApi = {
	context: () => call<CustomerContext>("/v1/customer/context"),
	requestLink: (email: string) =>
		call<{ sent: boolean }>("/v1/customer/auth/request-link", {
			method: "POST",
			body: JSON.stringify({ email }),
		}),
	verify: (token: string) =>
		call<{ token: string; expiresAt: string }>("/v1/customer/auth/verify", {
			method: "POST",
			body: JSON.stringify({ token }),
			signOutOnExpiry: false,
		}),
	/**
	 * Trade a storefront's handoff ticket for a portal session.
	 *
	 * 🔴 `signOutOnExpiry: false`, for the same reason as `verify`. A spent TICKET
	 * answers SESSION_EXPIRED, which is a different thing from a dead session —
	 * and clearing storage on it would wipe the session this very request just
	 * created. StrictMode double-invokes effects in development, so the second run
	 * would otherwise delete what the first one stored and loop forever.
	 */
	redeemHandoff: (token: string) =>
		call<{ token: string; expiresAt: string }>(
			"/v1/customer/portal-handoff/redeem",
			{
				method: "POST",
				body: JSON.stringify({ token }),
				signOutOnExpiry: false,
			},
		),
	me: () =>
		call<{ customerId: string; hasRecords: boolean }>("/v1/customer/auth/me"),
	signOut: () =>
		call<{ signedOut: boolean }>("/v1/customer/auth/sign-out", {
			method: "POST",
		}),
	list: (resource: "orders" | "bookings" | "invoices") =>
		call<{ items: Record<string, unknown>[] }>(`/v1/customer/${resource}`),
	listMessages: () =>
		call<{ items: PortalConversation[] }>("/v1/customer/messages"),
	getMessage: (id: string) =>
		call<PortalConversation>(`/v1/customer/messages/${id}`),
	startMessage: (input: { subject: string; body: string }) =>
		call<PortalConversation>("/v1/customer/messages", {
			method: "POST",
			body: JSON.stringify(input),
		}),
	replyToMessage: (id: string, body: string) =>
		call(`/v1/customer/messages/${id}/replies`, {
			method: "POST",
			body: JSON.stringify({ body }),
		}),
	markMessageRead: (id: string) =>
		call(`/v1/customer/messages/${id}/read`, { method: "POST" }),
};

/**
 * Which sections the portal shows, derived from the workspace's enabled
 * modules — exactly as QuickDash's own sidebar is.
 *
 * A gem shop gets Orders; a clinic gets Bookings; an agency gets Invoices. The
 * portal never offers a section the business does not run, because the matching
 * API route would answer `MODULE_DISABLED` anyway.
 */
export const SECTIONS = [
	{ id: "messages", label: "Messages", module: null },
	{ id: "orders", label: "Orders", module: "orders" },
	{ id: "bookings", label: "Bookings", module: "bookings" },
	{ id: "invoices", label: "Invoices", module: "invoicing" },
] as const;

export function sectionsFor(modules: readonly string[]) {
	return SECTIONS.filter(
		(section) => section.module === null || modules.includes(section.module),
	);
}
