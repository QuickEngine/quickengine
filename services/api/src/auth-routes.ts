import { auth, isAllowedOrigin } from "@quickengine/auth/server";
import type { Hono } from "hono";
import type { PlatformEnv } from "./platform-types";

/**
 * The identity server.
 *
 * Better Auth's handler, mounted here rather than in the auth app. The auth app
 * is now a static SPA with no server, and identity endpoints belong on the
 * canonical API boundary anyway — the same shape Maschina uses: logic in a
 * package, HTTP in the API service, UI as a Vite app.
 *
 * **Users never see this host.** `auth.quickdash.xyz` rewrites `/api/auth/*`
 * here, so OAuth redirect URIs and anything a customer or a provider dashboard
 * displays stay on the clean domain. Cookies are unaffected either way because
 * `AUTH_COOKIE_DOMAIN` is the shared parent domain.
 *
 * **The path must stay `/api/auth/*`.** Better Auth derives its own routes from
 * its configured base path, and OAuth callback URLs registered with Google and
 * GitHub are absolute. Changing this breaks every existing sign-in.
 */

/**
 * Sibling surfaces call this cross-origin, so the browser sends a preflight and
 * expects `Access-Control-*` on every response. Better Auth validates `Origin`
 * for CSRF but does not emit CORS headers itself.
 *
 * Credentialed, so the allow-origin **must echo the caller** and can never be
 * `*` — a wildcard with credentials is rejected by browsers and would be a
 * serious hole if it were not.
 */
function corsHeaders(request: Request): Record<string, string> {
	const origin = request.headers.get("origin");
	if (!origin || !isAllowedOrigin(origin)) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type,Authorization",
		Vary: "Origin",
	};
}

const withCors = (response: Response, request: Request): Response => {
	const cors = corsHeaders(request);
	if (Object.keys(cors).length === 0) return response;
	// Clone: a returned Response's headers can be immutable.
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(cors)) headers.set(key, value);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

export function registerAuthRoutes(app: Hono<PlatformEnv>) {
	app.options("/api/auth/*", (c) => c.body(null, 204, corsHeaders(c.req.raw)));

	app.on(["GET", "POST"], "/api/auth/*", async (c) =>
		withCors(await auth.handler(c.req.raw), c.req.raw),
	);

	/**
	 * Server-side sign-out.
	 *
	 * Surfaces link here rather than calling the auth API cross-origin, because a
	 * link is a plain navigation with no CORS involved. The session-clearing
	 * `Set-Cookie` headers must be carried onto the redirect — dropping them
	 * leaves the user believing they signed out while the cookie survives.
	 */
	app.get("/api/auth-signout", async (c) => {
		const target = resolveSignOutDestination(c.req.query("redirect"));
		try {
			const result = await auth.api.signOut({
				headers: c.req.raw.headers,
				asResponse: true,
			});
			const headers = new Headers({ location: target });
			for (const cookie of result.headers.getSetCookie()) {
				headers.append("set-cookie", cookie);
			}
			return new Response(null, { status: 302, headers });
		} catch {
			// No active session, or already signed out. Bounce anyway.
			return c.redirect(target, 302);
		}
	});
}

/**
 * Where a signed-out user lands.
 *
 * Only our own origins are accepted. Without this, `?redirect=https://evil.com`
 * turns sign-out into an open redirect — a phishing primitive that looks
 * legitimate precisely because it starts on our domain.
 */
function resolveSignOutDestination(redirect: string | undefined): string {
	const fallback = process.env.QUICKENGINE_ACCOUNT_URL ?? "/";
	if (!redirect) return fallback;
	const allowed = [
		process.env.QUICKENGINE_ACCOUNT_URL,
		process.env.QUICKENGINE_WEB_URL,
		process.env.QUICKENGINE_AUTH_URL,
		process.env.QUICKDASH_ADMIN_URL,
	]
		.filter((value): value is string => Boolean(value))
		.map((value) => new URL(value).origin);
	try {
		const candidate = new URL(redirect, fallback);
		return allowed.includes(candidate.origin) ? candidate.toString() : fallback;
	} catch {
		return fallback;
	}
}
