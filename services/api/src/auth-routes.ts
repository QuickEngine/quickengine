import { auth, isAllowedOrigin } from "@quickengine/auth/server";
import type { Hono } from "hono";
import { resolveSignOutDestination } from "./auth-redirect";
import type { PlatformEnv } from "./platform-types";

/**
 * The custom URI scheme the desktop and mobile shells register.
 *
 * Hardcoded on purpose — see the handoff route below. Accepting this from the
 * request would turn the endpoint into an open session-token redirector.
 */
const NATIVE_SCHEME = "quickdash";

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
	/**
	 * Hands a native shell a bearer token after a browser sign-in.
	 *
	 * 🔑 Why this exists. Google actively degrades — and may block — OAuth inside
	 * an embedded webview, as an anti-phishing measure. So the native app cannot
	 * sign in inside itself; it opens the SYSTEM browser, the user authenticates
	 * there, and control has to come back somehow.
	 *
	 * A cookie cannot make that trip: it is set on the auth origin in the system
	 * browser, and the app is a different process with its own storage. The token
	 * has to be handed over explicitly, which is what `bearer()` in the Better
	 * Auth config is already there to accept.
	 *
	 * The flow:
	 *   1. app opens the system browser at the normal OAuth start, with
	 *      `callbackURL` pointing back here
	 *   2. provider → Better Auth callback → session cookie set in that browser
	 *   3. this route reads that session and redirects to the app's custom scheme
	 *      with the token attached
	 *   4. the app stores it and sends `Authorization: Bearer <token>`
	 *
	 * ⚠️ The redirect target is NOT taken from the request. A caller-supplied
	 * scheme would let any page that can reach this endpoint redirect a live
	 * session token to a URI it controls — that is a session-stealing hole, not a
	 * flexibility feature. The scheme is fixed here and belongs to our own app.
	 */
	/**
	 * Starts a provider sign-in from a plain navigation.
	 *
	 * 🔴 This exists because Better Auth's social sign-in is `POST /sign-in/social`
	 * and returns the provider URL as JSON. A shell can only hand the system
	 * browser a URL to OPEN — it cannot make it POST — so something has to turn a
	 * GET into that POST and follow the answer. That is all this does.
	 *
	 * The `Set-Cookie` headers must be carried onto the redirect. They hold the
	 * OAuth state and PKCE verifier, and without them the provider's callback is
	 * rejected as a forgery — correctly, since state that never left the server is
	 * indistinguishable from state an attacker supplied.
	 *
	 * `callbackURL` is built here, never read from the request, for the same
	 * reason the handoff's target is fixed: an attacker-supplied callback would
	 * end a real sign-in on a page they control.
	 */
	app.get("/api/auth-native-start", async (c) => {
		const provider = c.req.query("provider");
		if (provider !== "google" && provider !== "github") {
			return c.redirect(`${NATIVE_SCHEME}://auth?error=bad_provider`, 302);
		}

		try {
			const result = await auth.api.signInSocial({
				body: {
					provider,
					// Absolute, and on the auth origin — the same origin Better Auth is
					// configured with, so it passes the trusted-origin check without the
					// API host having to be trusted for redirects as well.
					callbackURL: `${authOrigin()}/api/auth-native-handoff`,
				},
				asResponse: true,
			});

			const { url } = (await result.json()) as { url?: string };
			if (!url) {
				return c.redirect(`${NATIVE_SCHEME}://auth?error=no_provider_url`, 302);
			}

			const headers = new Headers({ location: url });
			for (const cookie of result.headers.getSetCookie()) {
				headers.append("set-cookie", cookie);
			}
			return new Response(null, { status: 302, headers });
		} catch {
			// Provider misconfigured or unreachable. Send the shell an error it can
			// show rather than leaving the browser on a blank API response.
			return c.redirect(`${NATIVE_SCHEME}://auth?error=start_failed`, 302);
		}
	});

	app.get("/api/auth-native-handoff", async (c) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (!session?.session) {
			return c.redirect(`${NATIVE_SCHEME}://auth?error=no_session`, 302);
		}
		const token = encodeURIComponent(session.session.token);
		return c.redirect(`${NATIVE_SCHEME}://auth?token=${token}`, 302);
	});

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
 * The public auth origin, `auth.quickdash.xyz`.
 *
 * Not this service's own host. Better Auth is configured against that origin and
 * every OAuth redirect URI registered with Google and GitHub points at it, so a
 * `callbackURL` built from anything else fails the trusted-origin check.
 */
function authOrigin(): string {
	const configured = process.env.QUICKENGINE_AUTH_URL;
	if (!configured) throw new Error("QUICKENGINE_AUTH_URL is not set");
	return new URL(configured).origin;
}
