// Pure open-redirect guard. Resolves a post-auth `?redirect=` target to a SAFE
// URL: only origins on the allow-list are honored; a relative path resolves
// against `base` (our own, allow-listed origin); everything else — external
// hosts, protocol-relative `//evil.com`, userinfo tricks (`…@evil.com`),
// `javascript:`/`data:` schemes, scheme mismatches, garbage — falls back.
//
// Dependency-free + isomorphic (no `window`, no env import) so it's unit-testable
// in isolation and shared by both the server guard and the client hook.
export type RedirectConfig = {
	allowedOrigins: string[];
	base: string;
	fallback: string;
};

export function resolveRedirect(
	redirect: string | null | undefined,
	{ allowedOrigins, base, fallback }: RedirectConfig,
): string {
	if (!redirect) return fallback;
	try {
		// Absolute targets keep their own origin; relative ones resolve against
		// `base`. Either way we only trust the resulting origin if it's allow-listed.
		const url = new URL(redirect, base);
		return allowedOrigins.includes(url.origin) ? url.href : fallback;
	} catch {
		return fallback;
	}
}
