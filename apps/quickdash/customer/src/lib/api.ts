/**
 * The Customer API client.
 *
 * One deployment serves every workspace, so which workspace a visitor is in is
 * resolved per request rather than baked at build time.
 */

const SESSION_KEY = "quickdash-customer-session";

/**
 * Which workspace this visit belongs to.
 *
 * Production resolves it from the HOST — `account.gemsutopia.com` is one
 * workspace, another domain is another. Locally there are no custom domains, so
 * a `?workspace=` parameter stands in and is remembered for the session.
 *
 * ⚠️ The publishable key is fetched per workspace rather than embedded, because
 * a single build cannot carry a hundred clients' keys. Until that endpoint
 * exists it comes from an env var, which works for one workspace and is the
 * known gap before this serves more than one.
 */
export function resolveWorkspace(): string | null {
	const fromQuery = new URLSearchParams(window.location.search).get(
		"workspace",
	);
	if (fromQuery) {
		sessionStorage.setItem("quickdash-workspace", fromQuery);
		return fromQuery;
	}
	return sessionStorage.getItem("quickdash-workspace");
}

export function publishableKey(): string {
	return import.meta.env.VITE_CUSTOMER_PUBLISHABLE_KEY ?? "";
}

export const session = {
	get: () => localStorage.getItem(SESSION_KEY),
	set: (token: string) => localStorage.setItem(SESSION_KEY, token),
	clear: () => localStorage.removeItem(SESSION_KEY),
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
	init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set("QuickEngine-Publishable-Key", publishableKey());
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
		if (code === "SESSION_EXPIRED") session.clear();
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
		}),
	me: () =>
		call<{ customerId: string; hasRecords: boolean }>("/v1/customer/auth/me"),
	signOut: () =>
		call<{ signedOut: boolean }>("/v1/customer/auth/sign-out", {
			method: "POST",
		}),
	list: (resource: "orders" | "bookings" | "invoices") =>
		call<{ items: Record<string, unknown>[] }>(`/v1/customer/${resource}`),
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
	{ id: "orders", label: "Orders", module: "orders" },
	{ id: "bookings", label: "Bookings", module: "bookings" },
	{ id: "invoices", label: "Invoices", module: "invoicing" },
] as const;

export function sectionsFor(modules: readonly string[]) {
	return SECTIONS.filter((section) => modules.includes(section.module));
}
