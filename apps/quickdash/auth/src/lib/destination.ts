import { env } from "./env";
import { resolveRedirect } from "./redirect";

// The QuickEngine app origins a freshly-authed user may be sent to. Anything
// else — e.g. a crafted `?redirect=https://evil.com` — is ignored (see the
// open-redirect guard in `_redirect.ts`).
const ALLOWED_ORIGINS = [
	env.VITE_ACCOUNT_URL,
	env.VITE_WEB_URL,
	env.VITE_AUTH_URL,
	env.VITE_DASH_URL,
].map((u) => new URL(u).origin);

export const FALLBACK_DESTINATION = env.VITE_ACCOUNT_URL;

// Resolve the post-auth landing URL: the `?redirect=` target when it points at
// one of our own apps, otherwise the account dashboard.
export function resolveDestination(
	redirect: string | null | undefined,
): string {
	return resolveRedirect(redirect, {
		allowedOrigins: ALLOWED_ORIGINS,
		base: env.VITE_AUTH_URL,
		fallback: FALLBACK_DESTINATION,
	});
}
