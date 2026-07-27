import { createQuickBrowser } from "@quickengine/quick/browser";
import { QueryClient } from "@tanstack/react-query";

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

export const queryClient = new QueryClient({
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
