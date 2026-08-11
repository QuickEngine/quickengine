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

function sessionExpired() {
	if (redirecting) return;
	redirecting = true;
	window.location.href = `${clientEnv.AUTH_URL}/signin?reason=expired&redirect=${encodeURIComponent(window.location.href)}`;
}

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error) => {
			if ((error as { status?: number })?.status === 401) sessionExpired();
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
