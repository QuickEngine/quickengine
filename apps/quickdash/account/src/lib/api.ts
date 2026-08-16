import { authClient } from "@quickengine/auth/client";
import { createQuickBrowser } from "@quickengine/quick/browser";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { clientEnv } from "@/lib/env";

/**
 * The API client for the account console.
 *
 * **Deliberately the same SDK customers use.** Until now nothing in the monorepo
 * depended on `@quickengine/quick`, which meant nobody was exercising the client
 * we tell people to build against. If it is awkward here, it is awkward for them.
 *
 * Same-origin: `vercel.json` rewrites `/v1/*` to the API in production and the
 * Vite dev server proxies it locally, so cookies are sent without any CORS
 * negotiation and no base URL has to be configured per environment.
 */
export const api = createQuickBrowser({
	baseUrl: window.location.origin,
	credential: { type: "session" },
});

/**
 * 🔴 A 401 means the session is gone, and the ONLY correct response is to send
 * the visitor somewhere that says so.
 *
 * Before this, the account app recognised a 401 well enough not to retry it and
 * then did nothing else — so an expired session rendered as a failed query on a
 * dashboard that still looked signed in. People read that as the product losing
 * their data, not as needing to sign in again.
 *
 * ⚠️ Guarded against a redirect loop. `signin` bounces an authenticated visitor
 * straight back here, so if the cookie is present but the API disagrees the two
 * can ping-pong forever. The flag makes it happen at most once per page load.
 */
let redirecting = false;

/**
 * A 401 from one request is a claim, not a verdict.
 *
 * 🔴 This used to redirect on the first 401 it saw anywhere. That was survivable
 * while the console only fetched on navigation; it stopped being survivable the
 * moment a page started POLLING. One endpoint answering 401 — for its own
 * reasons, or once, transiently — threw the operator out to sign-in in the middle
 * of what they were doing, and the poll made it happen again every 20 seconds.
 *
 * So ask the authority. `authClient.getSession()` is what actually knows whether
 * the session is gone; if it still has one, the 401 belonged to that request and
 * the person keeps their place. Only a confirmed absence signs anybody out.
 */
async function sessionExpired() {
	if (redirecting) return;
	redirecting = true;

	// 🔴 The first seconds after sign-in are not evidence of anything.
	//
	// Arriving from the auth app, the cookie is still settling while the first
	// page fires its queries — and the landing page fires nine of them. One 401
	// in that window sent the operator back to sign-in, which saw a perfectly
	// valid session and sent them straight back here: a loop that made the
	// product impossible to log into. Early 401s are ignored outright.
	if (performance.now() < 4000) {
		redirecting = false;
		return;
	}

	// Ask the authority, twice, a beat apart. `authClient.getSession()` is what
	// actually knows whether the session is gone; a single negative can still be
	// a request that raced a token refresh, and signing somebody out mid-work is
	// not a mistake worth making twice.
	for (const wait of [0, 1500]) {
		if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
		try {
			const { data } = await authClient.getSession();
			if (data?.session) {
				// The session is fine. Whatever answered 401 has a different problem,
				// and throwing the user out would hide it behind a login screen.
				redirecting = false;
				return;
			}
		} catch {
			// Unverifiable is not the same as absent — try again before acting.
		}
	}

	window.location.href = `${clientEnv.AUTH_URL}/signin?reason=expired&redirect=${encodeURIComponent(window.location.href)}`;
}

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error) => {
			if ((error as { status?: number })?.status === 401) void sessionExpired();
		},
	}),
	defaultOptions: {
		queries: {
			// Account data changes rarely and is re-read on every navigation. A short
			// stale window stops a workspace list refetching on every back-button
			// press while still catching a change made in another tab.
			staleTime: 30_000,
			retry: (failureCount, error) => {
				// Never retry a refusal — a 401, 403 or 404 will refuse identically the
				// second time, and retrying only delays telling the user.
				const status = (error as { status?: number })?.status;
				if (status && status >= 400 && status < 500) return false;
				return failureCount < 2;
			},
		},
	},
});
