import { clientEnv } from "@quickengine/env/client";

// Origins we're willing to send a user to after auth. Anything else — e.g. a
// crafted `?redirect=https://evil.com` — is ignored. This is our open-redirect
// guard: without it the auth app would forward a logged-in session off-site.
// Pure + isomorphic (no `window`) so both the server guard and the client hook
// share one source of truth.
const ALLOWED_ORIGINS = [
	clientEnv.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL,
	clientEnv.NEXT_PUBLIC_QUICKENGINE_WEB_URL,
	clientEnv.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
].map((u) => new URL(u).origin);

export const FALLBACK_DESTINATION =
	clientEnv.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL;

// Resolve the post-auth landing URL: the `?redirect=` target when it points at
// one of our own apps, otherwise the account dashboard. Relative targets resolve
// against the auth app's own (allow-listed) origin.
export function resolveDestination(
	redirect: string | null | undefined,
): string {
	if (!redirect) return FALLBACK_DESTINATION;
	try {
		const url = new URL(redirect, clientEnv.NEXT_PUBLIC_QUICKENGINE_AUTH_URL);
		return ALLOWED_ORIGINS.includes(url.origin)
			? url.href
			: FALLBACK_DESTINATION;
	} catch {
		return FALLBACK_DESTINATION;
	}
}
