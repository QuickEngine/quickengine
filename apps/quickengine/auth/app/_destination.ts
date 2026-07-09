import { clientEnv } from "@quickengine/env/client";
import { resolveRedirect } from "./_redirect";

// The QuickEngine app origins a freshly-authed user may be sent to. Anything
// else — e.g. a crafted `?redirect=https://evil.com` — is ignored (see the
// open-redirect guard in `_redirect.ts`).
const ALLOWED_ORIGINS = [
	clientEnv.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL,
	clientEnv.NEXT_PUBLIC_QUICKENGINE_WEB_URL,
	clientEnv.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
].map((u) => new URL(u).origin);

export const FALLBACK_DESTINATION =
	clientEnv.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL;

// Resolve the post-auth landing URL: the `?redirect=` target when it points at
// one of our own apps, otherwise the account dashboard.
export function resolveDestination(
	redirect: string | null | undefined,
): string {
	return resolveRedirect(redirect, {
		allowedOrigins: ALLOWED_ORIGINS,
		base: clientEnv.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
		fallback: FALLBACK_DESTINATION,
	});
}
