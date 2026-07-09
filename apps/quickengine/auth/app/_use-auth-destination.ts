"use client";

import { clientEnv } from "@quickengine/env/client";
import { useQueryState } from "nuqs";

// Origins we're willing to bounce a freshly-authenticated user to. Anything else
// — e.g. a crafted `?redirect=https://evil.com` — is ignored. This is our
// open-redirect guard: without it, the auth app would happily forward a logged-in
// session to an attacker's site.
const ALLOWED_ORIGINS = [
	clientEnv.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL,
	clientEnv.NEXT_PUBLIC_QUICKENGINE_WEB_URL,
	clientEnv.NEXT_PUBLIC_QUICKENGINE_AUTH_URL,
].map((u) => new URL(u).origin);

function safeDestination(target: string | null, fallback: string): string {
	if (!target) return fallback;
	try {
		const url = new URL(target, window.location.origin);
		const trusted =
			url.origin === window.location.origin ||
			ALLOWED_ORIGINS.includes(url.origin);
		return trusted ? url.href : fallback;
	} catch {
		return fallback;
	}
}

// Where to send the user after auth: the `?redirect=` target when it points at
// one of our own apps, otherwise the account dashboard. Read via nuqs so the
// target lives in the URL and survives the OAuth round-trip and refreshes.
export function useAuthDestination(): string {
	const [redirect] = useQueryState("redirect");
	return safeDestination(
		redirect,
		clientEnv.NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL,
	);
}
